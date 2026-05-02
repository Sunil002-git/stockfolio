from django.db.models import Sum
from django.db.models.functions import TruncDate, TruncMonth
from rest_framework import viewsets, generics
from rest_framework.permissions import IsAuthenticated, AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.views import TokenObtainPairView

from .models import Journal, Trade, Transaction
from .serializers import (
    JournalSerializer,
    RegisterSerializer,
    TradeSerializer,
    TransactionSerializer,
)


# ─── Auth ────────────────────────────────────────────────────────────────────

class RegisterView(generics.CreateAPIView):
    serializer_class = RegisterSerializer
    permission_classes = [AllowAny]


class LoginView(TokenObtainPairView):
    pass


# ─── Trade ───────────────────────────────────────────────────────────────────

class TradeViewSet(viewsets.ModelViewSet):
    serializer_class = TradeSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        qs = Trade.objects.filter(user=self.request.user)
        segment = self.request.query_params.get('segment')
        exchange = self.request.query_params.get('exchange')
        if segment:
            qs = qs.filter(segment=segment)
        if exchange:
            qs = qs.filter(exchange=exchange)
        return qs

    def perform_create(self, serializer):
        serializer.save(user=self.request.user)


# ─── Transaction ─────────────────────────────────────────────────────────────

class TransactionViewSet(viewsets.ModelViewSet):
    serializer_class = TransactionSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return Transaction.objects.filter(user=self.request.user)

    def perform_create(self, serializer):
        serializer.save(user=self.request.user)


# ─── Journal ─────────────────────────────────────────────────────────────────

class JournalViewSet(viewsets.ModelViewSet):
    serializer_class = JournalSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return Journal.objects.filter(trade__user=self.request.user)


# ─── Dashboard ───────────────────────────────────────────────────────────────

class DashboardView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        user = request.user
        trades = Trade.objects.filter(user=user)
        transactions = Transaction.objects.filter(user=user)

        total_deposit = transactions.filter(type='deposit').aggregate(
            s=Sum('amount'))['s'] or 0
        total_withdraw = transactions.filter(type='withdraw').aggregate(
            s=Sum('amount'))['s'] or 0

        closed_trades = [t for t in trades if t.sell_price is not None]
        open_trades = [t for t in trades if t.sell_price is None]

        total_profit = sum(t.profit_loss() for t in closed_trades)
        total_charges = trades.aggregate(s=Sum('charges'))['s'] or 0
        total_invested = sum(t.invested_amount() for t in open_trades)

        balance = total_deposit - total_withdraw + total_profit

        # Segment breakdown
        segment_stats = {}
        for seg_key, seg_label in Trade.SEGMENT_CHOICES:
            seg_trades = [t for t in closed_trades if t.segment == seg_key]
            segment_stats[seg_key] = {
                'label': seg_label,
                'count': len(seg_trades),
                'profit_loss': sum(t.profit_loss() for t in seg_trades),
            }

        return Response({
            "total_deposit": total_deposit,
            "total_withdraw": total_withdraw,
            "total_profit": total_profit,
            "total_charges": total_charges,
            "total_invested": total_invested,
            "balance": balance,
            "total_trades": trades.count(),
            "open_trades": len(open_trades),
            "closed_trades": len(closed_trades),
            "segment_stats": segment_stats,
        })


# ─── Reports ─────────────────────────────────────────────────────────────────

class DailyReportView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        trades = Trade.objects.filter(user=request.user, sell_price__isnull=False)
        daily = []
        for item in trades.annotate(day=TruncDate('date')).values('day').order_by('day'):
            day = item['day']
            day_trades = [t for t in trades if t.date == day]
            daily.append({
                'day': day,
                'total_profit': sum(t.profit_loss() for t in day_trades),
                'trade_count': len(day_trades),
            })
        return Response(daily)


class MonthlyReportView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        trades = Trade.objects.filter(user=request.user, sell_price__isnull=False)
        monthly = {}
        for trade in trades:
            key = trade.date.strftime('%Y-%m')
            if key not in monthly:
                monthly[key] = {'month': key, 'total_profit': 0, 'trade_count': 0}
            monthly[key]['total_profit'] += trade.profit_loss()
            monthly[key]['trade_count'] += 1
        return Response(sorted(monthly.values(), key=lambda x: x['month']))
