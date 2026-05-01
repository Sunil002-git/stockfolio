from django.shortcuts import render
from rest_framework_simplejwt.views import TokenObtainPairView
from rest_framework.permissions import IsAuthenticated
from rest_framework import viewsets
from .models import Trade , Journal, Transaction
from .serializers import TradeSerializer, TransactionSerializer, JournalSerializer
from django.db.models import Sum
from rest_framework.views import APIView
from rest_framework.response import Response
from django.db.models.functions import TruncDate, TruncMonth

# Create your views here.
class LoginView(TokenObtainPairView):
    pass

class TradeViewSet(viewsets.ModelViewSet):
    serializer_class = TradeSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return Trade.objects.filter(user=self.request.user)
    
    def perform_create(self, serializer):
        serializer.save(user=self.request.user)


class TransactionViewSet(viewsets.ModelViewSet):
    serializer_class = TransactionSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return Transaction.objects.filter(user=self.request.user)
    
    def perform_create(self, serializer):
        serializer.save(user=self.request.user)


class JournalViewSet(viewsets.ModelViewSet):
    serializer_class = JournalSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return Journal.objects.filter(trade__user=self.request.user)
    
    def perform_create(self, serializer):
        serializer.save(user=self.request.user)

class DashboardView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        user = request.user

        trades = Trade.objects.filter(user=user)
        transactions = Transaction.objects.filter(user=user)

        # Total deposits
        total_deposit = transactions.filter(type='deposit').aggregate(Sum('amount'))['amount__sum'] or 0

        # Total withdrawls
        total_withdraw = transactions.filter(type='withdraw').aggregate(Sum('amount'))['amount__sum'] or 0

        # Total Profit
        total_profit = sum([trade.profit_loss() for trade in trades])

        #Total charges
        total_charges = trades.aggregate(Sum('charges'))['charges__sum'] or 0

        # Balance
        balance = total_deposit - total_withdraw + total_profit

        return Response({
            "total_deposit": total_deposit,
            "total_withdraw": total_withdraw,
            "total_profit": total_profit,
            "total_charges": total_charges,
            "balance": balance,
            "total_trades": trades.count()
        })

class DailyReportView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        user = request.user

        trades = Trade.objects.filter(user=user)
        data = trades.annotate(day=TruncDate('date')).values('day').annotate(total_profit=Sum('sell_price') - Sum('buy_price').order_by('day'))

        return Response(data)

class MonthlyReportView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        user = request.user

        trades = Trade.objects.filter(user=user)

        data = trades.annotate(month=TruncMonth('date')).values('month').annotate(
            # total_profit=Sum('sell_price') - Sum('buy_price')
            total_profit= sum([trade.profit_loss() for trade in trades])
        ).ordder_by('month')

        return Response(data)
    