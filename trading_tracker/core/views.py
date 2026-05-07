from datetime import date, timedelta
from django.db.models import Sum
from rest_framework import viewsets, generics, status
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated, AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.views import TokenObtainPairView

from .models import Broker, Journal, Trade, TradeGroup, Transaction, User, UserSettings
from .serializers import (
    BrokerSerializer,
    BuyTradeSerializer,
    JournalSerializer,
    RegisterSerializer,
    SellTradeSerializer,
    TradeGroupSerializer,
    TradeGroupSummarySerializer,
    TradeSerializer,
    TransactionSerializer,
    UserSettingsSerializer,
)


# ─── Auth ────────────────────────────────────────────────────────────────────

class RegisterView(generics.CreateAPIView):
    serializer_class = RegisterSerializer
    permission_classes = [AllowAny]


class LoginView(TokenObtainPairView):
    pass


# ─── Balance helper ───────────────────────────────────────────────────────────

def compute_balance(user):
    """
    Realistic balance:
      + All deposits
      - All withdrawals
      - All buy costs  (buy_price × qty + charges)
      + All sell proceeds (sell_price × qty - charges)
    """
    transactions = Transaction.objects.filter(user=user)
    deposits   = transactions.filter(type='deposit').aggregate(s=Sum('amount'))['s'] or 0
    withdrawals = transactions.filter(type='withdraw').aggregate(s=Sum('amount'))['s'] or 0

    buys  = Trade.objects.filter(user=user, trade_type='buy')
    sells = Trade.objects.filter(user=user, trade_type='sell')

    buy_cost      = sum((t.buy_price or 0) * t.quantity + t.charges for t in buys)
    sell_proceeds = sum((t.sell_price or 0) * t.quantity - t.charges for t in sells)

    return round(deposits - withdrawals - buy_cost + sell_proceeds, 2)


# ─── Buy Entry ───────────────────────────────────────────────────────────────

class BuyTradeView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        serializer = BuyTradeSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        data = serializer.validated_data
        user = request.user

        # Optional: warn if balance insufficient (don't block, just inform)
        balance = compute_balance(user)
        cost = data['buy_price'] * data['quantity'] + data.get('charges', 0)
        balance_warning = None
        if balance < cost:
            balance_warning = f"Heads up: this trade costs ₹{cost:,.2f} but your current balance is ₹{balance:,.2f}."

        # Find or create open TradeGroup
        group, created = TradeGroup.objects.get_or_create(
            user=user,
            symbol=data['symbol'].upper(),
            segment=data['segment'],
            exchange=data['exchange'],
            is_closed=False,
            defaults={
                'strike_price': data.get('strike_price'),
                'expiry_date': data.get('expiry_date'),
                'lot_size': data.get('lot_size'),
                'fund_house': data.get('fund_house', ''),
            }
        )

        # Resolve broker
        broker = None
        broker_id = data.get('broker_id')
        if broker_id:
            try:
                broker = Broker.objects.get(pk=broker_id, user=user)
            except Broker.DoesNotExist:
                pass

        trade = Trade.objects.create(
            user=user,
            group=group,
            broker=broker,
            trade_type='buy',
            buy_price=data['buy_price'],
            quantity=data['quantity'],
            charges=data['charges'],
            date=data['date'],
            notes=data.get('notes', ''),
        )

        group.recalculate()

        # Fetch last closed trade of same symbol for context
        last_trade_context = _last_symbol_context(user, data['symbol'].upper(), exclude_group=group.id)

        resp = TradeGroupSerializer(group).data
        resp['new_balance'] = compute_balance(user)
        resp['balance_warning'] = balance_warning
        resp['last_trade_context'] = last_trade_context
        return Response(resp, status=status.HTTP_201_CREATED)


# ─── Sell Entry ──────────────────────────────────────────────────────────────

class SellTradeView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        serializer = SellTradeSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        data = serializer.validated_data
        group = data['group']
        user = request.user

        if group.user != user:
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)

        trade = Trade.objects.create(
            user=user,
            group=group,
            trade_type='sell',
            sell_price=data['sell_price'],
            quantity=data['quantity'],
            charges=data['charges'],
            date=data['date'],
            notes=data.get('notes', ''),
        )

        group.recalculate()
        pl = trade.profit_loss()
        new_balance = compute_balance(user)

        return Response({
            'trade': TradeSerializer(trade).data,
            'group': TradeGroupSummarySerializer(group).data,
            'profit_loss': pl,
            'new_balance': new_balance,
            'outcome': 'profit' if (pl or 0) >= 0 else 'loss',
        }, status=status.HTTP_201_CREATED)


# ─── Symbol history context helper ───────────────────────────────────────────

def _last_symbol_context(user, symbol, exclude_group=None):
    """Return last closed trade info for the same symbol."""
    qs = TradeGroup.objects.filter(
        user=user, symbol=symbol, is_closed=True
    )
    if exclude_group:
        qs = qs.exclude(pk=exclude_group)
    qs = qs.order_by('-updated_at')
    if not qs.exists():
        return None
    last = qs.first()
    pl = last.realized_pl()
    sells = last.trades.filter(trade_type='sell').order_by('-date')
    last_sell_date = str(sells.first().date) if sells.exists() else None
    return {
        'symbol': symbol,
        'realized_pl': round(pl, 2),
        'outcome': 'profit' if pl >= 0 else 'loss',
        'avg_cost': round(last.avg_cost, 2),
        'last_sell_date': last_sell_date,
    }


# ─── TradeGroup (Positions) ───────────────────────────────────────────────────

class TradeGroupViewSet(viewsets.ReadOnlyModelViewSet):
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        qs = TradeGroup.objects.filter(user=self.request.user)
        is_closed = self.request.query_params.get('is_closed')
        segment   = self.request.query_params.get('segment')
        exchange  = self.request.query_params.get('exchange')
        broker = self.request.query_params.get('broker')
        if is_closed is not None:
            qs = qs.filter(is_closed=is_closed.lower() == 'true')
        if segment:
            qs = qs.filter(segment=segment)
        if exchange:
            qs = qs.filter(exchange=exchange)
        if broker:
            qs = qs.filter(trades__broker_id=broker).distinct()
        return qs

    def get_serializer_class(self):
        return TradeGroupSerializer if self.action == 'retrieve' else TradeGroupSummarySerializer

    @action(detail=True, methods=['patch'])
    def edit_trade(self, request, pk=None):
        group = self.get_object()
        trade_id = request.data.get('trade_id')
        try:
            trade = group.trades.get(pk=trade_id, trade_type='buy')
        except Trade.DoesNotExist:
            return Response({"detail": "Trade not found."}, status=404)
        for field in ['buy_price', 'quantity', 'charges', 'date', 'notes']:
            if field in request.data:
                setattr(trade, field, request.data[field])
        trade.save()
        group.recalculate()
        return Response(TradeGroupSerializer(group).data)

    @action(detail=True, methods=['delete'])
    def delete_trade(self, request, pk=None):
        group = self.get_object()
        trade_id = request.query_params.get('trade_id')
        try:
            trade = group.trades.get(pk=trade_id)
        except Trade.DoesNotExist:
            return Response({"detail": "Trade not found."}, status=404)
        trade.delete()
        group.recalculate()
        if group.trades.count() == 0:
            group.delete()
            return Response({"detail": "Group deleted."}, status=204)
        return Response(TradeGroupSerializer(group).data)


# ─── Transaction ─────────────────────────────────────────────────────────────

class TransactionViewSet(viewsets.ModelViewSet):
    serializer_class = TransactionSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        qs = Transaction.objects.filter(user=self.request.user)
        type_     = self.request.query_params.get('type')
        from_date = self.request.query_params.get('from_date')
        to_date   = self.request.query_params.get('to_date')
        if type_:      qs = qs.filter(type=type_)
        if from_date:  qs = qs.filter(date__gte=from_date)
        if to_date:    qs = qs.filter(date__lte=to_date)
        return qs

    def perform_create(self, serializer):
        serializer.save(user=self.request.user)


# ─── Dashboard ───────────────────────────────────────────────────────────────

class DashboardView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        user   = request.user
        groups = TradeGroup.objects.filter(user=user)
        txns   = Transaction.objects.filter(user=user)

        deposits    = txns.filter(type='deposit').aggregate(s=Sum('amount'))['s'] or 0
        withdrawals = txns.filter(type='withdraw').aggregate(s=Sum('amount'))['s'] or 0

        open_groups   = groups.filter(is_closed=False)
        closed_groups = groups.filter(is_closed=True)

        total_realized_pl = sum(g.realized_pl() for g in groups)  # includes partial
        total_invested    = sum(g.total_invested for g in open_groups)
        trade_charges     = Trade.objects.filter(user=user).aggregate(s=Sum('charges'))['s'] or 0

        balance = compute_balance(user)

        # Win/loss rate
        closed_list = list(closed_groups)
        winning = sum(1 for g in closed_list if g.realized_pl() > 0)
        losing  = sum(1 for g in closed_list if g.realized_pl() < 0)
        win_rate = round(winning / len(closed_list) * 100, 1) if closed_list else 0

        # Segment breakdown
        segment_stats = {}
        for seg_key, seg_label in TradeGroup._meta.get_field('segment').choices:
            seg_groups = groups.filter(segment=seg_key)
            seg_pl = sum(g.realized_pl() for g in seg_groups)
            segment_stats[seg_key] = {
                'label': seg_label,
                'count': seg_groups.count(),
                'profit_loss': round(seg_pl, 2),
                'open': seg_groups.filter(is_closed=False).count(),
                'closed': seg_groups.filter(is_closed=True).count(),
            }

        return Response({
            "balance": balance,
            "total_deposit": deposits,
            "total_withdraw": withdrawals,
            "total_realized_pl": round(total_realized_pl, 2),
            "total_invested": round(total_invested, 2),
            "trade_charges": round(trade_charges, 2),
            "open_positions": open_groups.count(),
            "closed_positions": closed_groups.count(),
            "total_positions": groups.count(),
            "win_rate": win_rate,
            "winning_trades": winning,
            "losing_trades": losing,
            "segment_stats": segment_stats,
        })


# ─── Trade History (Activity Feed) ───────────────────────────────────────────

class TradeHistoryView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        user      = request.user
        symbol    = request.query_params.get('symbol', '').upper()
        trade_type = request.query_params.get('trade_type')
        from_date = request.query_params.get('from_date')
        to_date   = request.query_params.get('to_date')
        segment   = request.query_params.get('segment')

        trades = Trade.objects.filter(user=user).select_related('group').order_by('-date', '-created_at')

        broker    = request.query_params.get('broker')
        if symbol:     trades = trades.filter(group__symbol=symbol)
        if trade_type: trades = trades.filter(trade_type=trade_type)
        if from_date:  trades = trades.filter(date__gte=from_date)
        if to_date:    trades = trades.filter(date__lte=to_date)
        if segment:    trades = trades.filter(group__segment=segment)
        if broker:     trades = trades.filter(broker_id=broker)

        # Build activity list with running balance
        # First get all events (trades + transactions) sorted by date for running balance
        all_txns = list(Transaction.objects.filter(user=user).order_by('date', 'created_at'))
        all_trades = list(Trade.objects.filter(user=user).select_related('group').order_by('date', 'created_at'))

        # Build chronological event list for running balance
        events = []
        for t in all_txns:
            events.append({
                'sort_key': (str(t.date), str(t.created_at)),
                'type': 'transaction',
                'subtype': t.type,
                'amount': t.amount,
                'date': str(t.date),
            })
        for t in all_trades:
            cost = 0
            if t.trade_type == 'buy':
                cost = -((t.buy_price or 0) * t.quantity + t.charges)
            else:
                cost = (t.sell_price or 0) * t.quantity - t.charges
            events.append({
                'sort_key': (str(t.date), str(t.created_at)),
                'type': 'trade',
                'trade_id': t.id,
                'balance_delta': cost,
                'date': str(t.date),
            })
        events.sort(key=lambda x: x['sort_key'])

        # Compute running balance per trade_id
        running = 0
        balance_map = {}
        for ev in events:
            if ev['type'] == 'transaction':
                running += ev['amount'] if ev['subtype'] == 'deposit' else -ev['amount']
            else:
                running += ev['balance_delta']
                running = round(running, 2)
                balance_map[ev['trade_id']] = running

        # Build response items — for each previous closed group of same symbol,
        # attach the "last trade context" so user can see if they profited/lost before
        history = []
        for trade in trades:
            group = trade.group
            pl = trade.profit_loss()

            # For sell trades, look up previous closed group of same symbol
            prev_context = None
            if trade.trade_type == 'sell' and group:
                prev = TradeGroup.objects.filter(
                    user=user,
                    symbol=group.symbol,
                    is_closed=True,
                ).exclude(pk=group.id).order_by('-updated_at').first()
                if prev:
                    prev_pl = prev.realized_pl()
                    prev_sell = prev.trades.filter(trade_type='sell').order_by('-date').first()
                    prev_context = {
                        'realized_pl': round(prev_pl, 2),
                        'outcome': 'profit' if prev_pl >= 0 else 'loss',
                        'date': str(prev_sell.date) if prev_sell else None,
                    }

            history.append({
                'id': trade.id,
                'trade_type': trade.trade_type,
                'symbol': group.symbol if group else '—',
                'segment': group.segment if group else '—',
                'exchange': group.exchange if group else '—',
                'price': trade.buy_price if trade.trade_type == 'buy' else trade.sell_price,
                'quantity': trade.quantity,
                'charges': trade.charges,
                'date': str(trade.date),
                'notes': trade.notes,
                'avg_cost': round(group.avg_cost, 2) if group else None,
                'profit_loss': round(pl, 2) if pl is not None else None,
                'balance_after': balance_map.get(trade.id),
                'previous_trade_context': prev_context,
                'group_id': group.id if group else None,
                'strike_price': group.strike_price if group else None,
                'broker_id': trade.broker_id,
                'broker_name': trade.broker.name if trade.broker else None,
            })

        # Stock-specific summary: unique symbols traded
        symbol_summaries = []
        for sym in Trade.objects.filter(user=user).values_list('group__symbol', flat=True).distinct():
            if not sym:
                continue
            sym_groups = TradeGroup.objects.filter(user=user, symbol=sym)
            total_pl = sum(g.realized_pl() for g in sym_groups)
            trades_count = Trade.objects.filter(user=user, group__symbol=sym).count()
            last_trade = Trade.objects.filter(user=user, group__symbol=sym).order_by('-date', '-created_at').first()
            symbol_summaries.append({
                'symbol': sym,
                'total_pl': round(total_pl, 2),
                'outcome': 'profit' if total_pl >= 0 else 'loss',
                'trades_count': trades_count,
                'last_trade_date': str(last_trade.date) if last_trade else None,
                'last_trade_type': last_trade.trade_type if last_trade else None,
            })
        symbol_summaries.sort(key=lambda x: abs(x['total_pl']), reverse=True)

        return Response({
            'history': history,
            'symbol_summaries': symbol_summaries,
            'current_balance': compute_balance(user),
        })


# ─── Analytics ───────────────────────────────────────────────────────────────

def get_date_range(period, from_date=None, to_date=None):
    today = date.today()
    if from_date and to_date:
        return from_date, to_date
    if period == 'week':  return today - timedelta(days=today.weekday()), today
    if period == 'month': return today.replace(day=1), today
    if period == 'year':  return today.replace(month=1, day=1), today
    return today - timedelta(days=365), today


class AnalyticsView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        user      = request.user
        period    = request.query_params.get('period', 'year')
        from_date = request.query_params.get('from_date')
        to_date   = request.query_params.get('to_date')
        start, end = get_date_range(period, from_date, to_date)

        sell_trades = Trade.objects.filter(
            user=user, trade_type='sell',
            date__gte=start, date__lte=end,
        ).select_related('group').order_by('date')

        daily_pl = {}
        for trade in sell_trades:
            day = str(trade.date)
            pl = trade.profit_loss() or 0
            if day not in daily_pl:
                daily_pl[day] = {'date': day, 'profit_loss': 0, 'charges': 0, 'trades': 0}
            daily_pl[day]['profit_loss'] += pl
            daily_pl[day]['charges'] += trade.charges
            daily_pl[day]['trades'] += 1

        daily_list = sorted(daily_pl.values(), key=lambda x: x['date'])
        cumulative = 0
        for row in daily_list:
            cumulative += row['profit_loss']
            row['cumulative_pl'] = round(cumulative, 2)
            row['profit_loss']   = round(row['profit_loss'], 2)

        monthly_pl = {}
        for trade in sell_trades:
            key = trade.date.strftime('%Y-%m')
            pl  = trade.profit_loss() or 0
            if key not in monthly_pl:
                monthly_pl[key] = {'month': key, 'profit_loss': 0, 'trades': 0}
            monthly_pl[key]['profit_loss'] += pl
            monthly_pl[key]['trades'] += 1

        monthly_list = sorted(monthly_pl.values(), key=lambda x: x['month'])
        for row in monthly_list:
            row['profit_loss'] = round(row['profit_loss'], 2)

        total_pl     = sum(r['profit_loss'] for r in daily_list)
        winning_days = sum(1 for r in daily_list if r['profit_loss'] > 0)
        losing_days  = sum(1 for r in daily_list if r['profit_loss'] < 0)
        best_day     = max(daily_list, key=lambda x: x['profit_loss']) if daily_list else None
        worst_day    = min(daily_list, key=lambda x: x['profit_loss']) if daily_list else None

        txns       = Transaction.objects.filter(user=user, date__gte=start, date__lte=end)
        deposits   = txns.filter(type='deposit').aggregate(s=Sum('amount'))['s'] or 0
        withdrawals = txns.filter(type='withdraw').aggregate(s=Sum('amount'))['s'] or 0

        return Response({
            'period': period,
            'from_date': str(start),
            'to_date': str(end),
            'daily_pl': daily_list,
            'monthly_pl': monthly_list,
            'summary': {
                'total_pl': round(total_pl, 2),
                'total_trades': sell_trades.count(),
                'winning_days': winning_days,
                'losing_days': losing_days,
                'best_day': best_day,
                'worst_day': worst_day,
                'deposits': deposits,
                'withdrawals': withdrawals,
            }
        })


# ─── Broker ───────────────────────────────────────────────────────────────────

class BrokerViewSet(viewsets.ModelViewSet):
    serializer_class = BrokerSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        qs = Broker.objects.filter(user=self.request.user)
        if self.request.query_params.get('active_only') == 'true':
            qs = qs.filter(is_active=True)
        return qs

    def perform_create(self, serializer):
        serializer.save(user=self.request.user)


# ─── UserSettings ─────────────────────────────────────────────────────────────

class UserSettingsView(APIView):
    permission_classes = [IsAuthenticated]

    def _get_or_create(self, user):
        settings_obj, _ = UserSettings.objects.get_or_create(user=user)
        return settings_obj

    def get(self, request):
        obj = self._get_or_create(request.user)
        return Response(UserSettingsSerializer(obj).data)

    def patch(self, request):
        obj = self._get_or_create(request.user)
        serializer = UserSettingsSerializer(obj, data=request.data, partial=True)
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
