from datetime import date, timedelta
from django.contrib.auth import authenticate
from django.db import models
from django.db.models import Sum
from rest_framework_simplejwt.tokens import RefreshToken
from rest_framework import viewsets, generics, status
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated, AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.views import TokenObtainPairView

from .models import Broker, EmailConfig, Journal, OTPCode, Trade, TradeGroup, Transaction, User, UserSettings
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


class LoginView(APIView):
    """
    Custom login — returns access + refresh tokens plus basic user info.
    """
    permission_classes = []

    def post(self, request):
        username = request.data.get('username', '').strip()
        password = request.data.get('password', '').strip()

        if not username or not password:
            return Response({'error': 'Username and password are required.'}, status=400)

        user = authenticate(request, username=username, password=password)
        if not user:
            return Response({'error': 'Invalid username or password.'}, status=401)

        if not user.is_active:
            return Response({'error': 'Your account has been deactivated. Contact admin.'}, status=403)

        refresh = RefreshToken.for_user(user)
        return Response({
            'access':       str(refresh.access_token),
            'refresh':      str(refresh),
            'is_superuser': user.is_superuser,
            'is_staff':     user.is_staff,
            'username':     user.username,
        })


class TokenRefreshView(APIView):
    """Silent token refresh — call with refresh token, get new access token."""
    permission_classes = []

    def post(self, request):
        refresh_token = request.data.get('refresh')
        if not refresh_token:
            return Response({'error': 'Refresh token required.'}, status=400)
        try:
            refresh = RefreshToken(refresh_token)
            return Response({'access': str(refresh.access_token)})
        except Exception:
            return Response({'error': 'Invalid or expired refresh token.'}, status=401)


# ─── Balance helper ───────────────────────────────────────────────────────────

def compute_balance(user, broker_id=None):
    """
    Realistic balance optionally scoped to a single broker.
      + All deposits  (filtered by broker if given)
      - All withdrawals
      - All buy costs  (buy_price × qty + charges)
      + All sell proceeds (sell_price × qty - charges)
    """
    txns = Transaction.objects.filter(user=user)
    if broker_id:
        txns = txns.filter(broker_id=broker_id)
    deposits   = txns.filter(type='deposit').aggregate(s=Sum('amount'))["s"] or 0
    withdrawals = txns.filter(type='withdraw').aggregate(s=Sum('amount'))["s"] or 0

    buys  = Trade.objects.filter(user=user, trade_type='buy')
    sells = Trade.objects.filter(user=user, trade_type='sell')
    if broker_id:
        buys  = buys.filter(broker_id=broker_id)
        sells = sells.filter(broker_id=broker_id)

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
        broker    = self.request.query_params.get('broker')
        if type_:      qs = qs.filter(type=type_)
        if from_date:  qs = qs.filter(date__gte=from_date)
        if to_date:    qs = qs.filter(date__lte=to_date)
        if broker:     qs = qs.filter(broker_id=broker)
        return qs

    def perform_create(self, serializer):
        serializer.save(user=self.request.user)


# ─── Dashboard ───────────────────────────────────────────────────────────────

class DashboardView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        user   = request.user
        broker_id = request.query_params.get('broker')
        groups = TradeGroup.objects.filter(user=user)
        txns   = Transaction.objects.filter(user=user)
        if broker_id:
            groups = groups.filter(trades__broker_id=broker_id).distinct()
            txns   = txns.filter(broker_id=broker_id)

        deposits    = txns.filter(type='deposit').aggregate(s=Sum('amount'))['s'] or 0
        withdrawals = txns.filter(type='withdraw').aggregate(s=Sum('amount'))['s'] or 0

        # Scope trades to broker if selected
        trades_qs = Trade.objects.filter(user=user)
        if broker_id:
            trades_qs = trades_qs.filter(broker_id=broker_id)

        # Rebuild groups list based on which groups have trades under this broker
        if broker_id:
            group_ids = trades_qs.values_list('group_id', flat=True).distinct()
            groups = TradeGroup.objects.filter(id__in=group_ids)

        open_groups   = groups.filter(is_closed=False)
        closed_groups = groups.filter(is_closed=True)

        # P&L and investment — calculated only on broker-scoped trades
        buys_qs  = trades_qs.filter(trade_type='buy')
        sells_qs = trades_qs.filter(trade_type='sell')
        total_invested    = sum((t.buy_price or 0) * t.quantity + t.charges for t in buys_qs.filter(group__is_closed=False))
        sell_proceeds     = sum((t.sell_price or 0) * t.quantity for t in sells_qs)
        sell_costs        = sum(
            (t.avg_cost or 0) * t.quantity
            for t in sells_qs
            if hasattr(t, 'avg_cost')
        )
        total_realized_pl = sum(g.realized_pl() for g in groups)
        trade_charges     = trades_qs.aggregate(s=Sum('charges'))['s'] or 0

        balance = compute_balance(user, broker_id=broker_id)

        # Win/loss rate
        closed_list = list(closed_groups)
        winning  = sum(1 for g in closed_list if g.realized_pl() > 0)
        losing   = sum(1 for g in closed_list if g.realized_pl() < 0)
        win_rate = round(winning / len(closed_list) * 100, 1) if closed_list else 0

        # Segment breakdown — scoped to broker
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
            "total_deposit": round(deposits, 2),
            "total_withdraw": round(withdrawals, 2),
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
            "broker_id": broker_id,
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
            'current_balance': compute_balance(user, broker_id=broker),
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
        broker_id = request.query_params.get('broker')
        start, end = get_date_range(period, from_date, to_date)

        sell_trades = Trade.objects.filter(
            user=user, trade_type='sell',
            date__gte=start, date__lte=end,
        ).select_related('group').order_by('date')
        if broker_id:
            sell_trades = sell_trades.filter(broker_id=broker_id)

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
        if broker_id:
            txns = txns.filter(broker_id=broker_id)
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


# ─── OTP: Send (register + forgot password) ───────────────────────────────────

class SendOTPView(APIView):
    permission_classes = []  # public

    def post(self, request):
        email   = request.data.get('email', '').strip().lower()
        purpose = request.data.get('purpose', 'register')  # 'register' | 'forgot_password'

        if not email:
            return Response({'error': 'Email is required.'}, status=400)

        if purpose == 'forgot_password':
            try:
                user = User.objects.get(email__iexact=email)
            except User.DoesNotExist:
                # Don't reveal whether email exists
                return Response({'message': 'If that email is registered, an OTP has been sent.'})
        else:
            # Registration — email must NOT already exist
            if User.objects.filter(email__iexact=email).exists():
                return Response({'error': 'An account with this email already exists.'}, status=400)
            user = None

        from .email_utils import generate_otp, send_otp_email
        code = generate_otp()

        OTPCode.objects.create(
            user    = User.objects.filter(email__iexact=email).first(),
            email   = email,
            code    = code,
            purpose = purpose,
        )

        try:
            send_otp_email(email, code, purpose)
        except Exception as e:
            return Response({'error': f'Failed to send email: {str(e)}'}, status=500)

        return Response({'message': 'OTP sent successfully.'})


# ─── OTP: Verify ──────────────────────────────────────────────────────────────

class VerifyOTPView(APIView):
    permission_classes = []  # public

    def post(self, request):
        email   = request.data.get('email', '').strip().lower()
        code    = request.data.get('code', '').strip()
        purpose = request.data.get('purpose', 'register')

        otp = OTPCode.objects.filter(
            email=email, code=code, purpose=purpose, is_used=False
        ).order_by('-created_at').first()

        if not otp:
            return Response({'error': 'Invalid OTP.'}, status=400)
        if otp.is_expired():
            return Response({'error': 'OTP has expired. Please request a new one.'}, status=400)

        otp.is_used = True
        otp.save()
        return Response({'verified': True})


# ─── Register with OTP ────────────────────────────────────────────────────────

class RegisterWithOTPView(APIView):
    permission_classes = []  # public

    def post(self, request):
        email = request.data.get('email', '').strip().lower()
        code  = request.data.get('otp_code', '').strip()

        # Re-verify OTP (mark as used atomically)
        otp = OTPCode.objects.filter(
            email=email, code=code, purpose='register', is_used=False
        ).order_by('-created_at').first()

        if not otp or otp.is_expired():
            return Response({'error': 'OTP invalid or expired.'}, status=400)

        serializer = RegisterSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=400)

        user = serializer.save()
        user.is_verified = True
        user.save()
        otp.is_used = True
        otp.save()

        return Response({'message': 'Account created successfully. You can now sign in.'}, status=201)


# ─── Forgot Password ──────────────────────────────────────────────────────────

class ResetPasswordView(APIView):
    permission_classes = []  # public

    def post(self, request):
        email       = request.data.get('email', '').strip().lower()
        code        = request.data.get('otp_code', '').strip()
        new_password = request.data.get('new_password', '').strip()

        if not all([email, code, new_password]):
            return Response({'error': 'Email, OTP, and new password are required.'}, status=400)

        otp = OTPCode.objects.filter(
            email=email, code=code, purpose='forgot_password', is_used=False
        ).order_by('-created_at').first()

        if not otp or otp.is_expired():
            return Response({'error': 'OTP invalid or expired.'}, status=400)

        try:
            user = User.objects.get(email__iexact=email)
        except User.DoesNotExist:
            return Response({'error': 'User not found.'}, status=404)

        user.set_password(new_password)
        user.save()
        otp.is_used = True
        otp.save()

        return Response({'message': 'Password reset successfully. You can now sign in.'})


# ─── Profile ──────────────────────────────────────────────────────────────────

class ProfileView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        u = request.user
        return Response({
            'username':     u.username,
            'email':        u.email,
            'first_name':   u.first_name,
            'last_name':    u.last_name,
            'phone':        getattr(u, 'phone', ''),
            'is_verified':  u.is_verified,
            'is_staff':     u.is_staff,
            'is_superuser': u.is_superuser,
            'date_joined':  u.date_joined.strftime('%Y-%m-%d'),
        })

    def patch(self, request):
        u    = request.user
        data = request.data

        # Basic fields
        for field in ('first_name', 'last_name', 'phone'):
            if field in data:
                setattr(u, field, data[field])

        # Email change — requires re-verification (just update; no OTP here for simplicity)
        if 'email' in data and data['email'] != u.email:
            if User.objects.filter(email__iexact=data['email']).exclude(pk=u.pk).exists():
                return Response({'error': 'That email is already in use.'}, status=400)
            u.email = data['email']

        # Password change
        if data.get('new_password'):
            if not data.get('current_password'):
                return Response({'error': 'Current password is required to set a new one.'}, status=400)
            if not u.check_password(data['current_password']):
                return Response({'error': 'Current password is incorrect.'}, status=400)
            u.set_password(data['new_password'])

        u.save()
        return Response({
            'message':    'Profile updated.',
            'username':   u.username,
            'email':      u.email,
            'first_name': u.first_name,
            'last_name':  u.last_name,
            'phone':      getattr(u, 'phone', ''),
        })


# ─── Email Config (admin only) ────────────────────────────────────────────────

class EmailConfigView(APIView):
    permission_classes = [IsAuthenticated]

    def _is_admin(self, user):
        return user.is_staff or user.is_superuser

    def get(self, request):
        if not self._is_admin(request.user):
            return Response({'error': 'Superuser access required.'}, status=403)
        cfg = EmailConfig.objects.first()
        if not cfg:
            return Response({})
        return Response({
            'host':       cfg.host,
            'port':       cfg.port,
            'from_email': cfg.from_email,
            'email_name': cfg.email_name,
            'is_active':  cfg.is_active,
            # Never return password for security
        })

    def post(self, request):
        if not self._is_admin(request.user):
            return Response({'error': 'Superuser access required.'}, status=403)
        data = request.data
        cfg, _ = EmailConfig.objects.get_or_create(pk=1)
        cfg.host       = data.get('host',       cfg.host)
        cfg.port       = int(data.get('port',   cfg.port))
        cfg.from_email = data.get('from_email', cfg.from_email)
        cfg.email_name = data.get('email_name', cfg.email_name)
        cfg.is_active  = data.get('is_active',  cfg.is_active)
        if data.get('password'):
            cfg.password = data['password']
        cfg.save()
        return Response({'message': 'Email configuration saved.'})

    def delete(self, request):
        if not self._is_admin(request.user):
            return Response({'error': 'Superuser access required.'}, status=403)
        EmailConfig.objects.all().delete()
        return Response({'message': 'Email configuration cleared.'})


# ─── Test Email ───────────────────────────────────────────────────────────────

class TestEmailView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        if not (request.user.is_staff or request.user.is_superuser):
            return Response({'error': 'Superuser access required.'}, status=403)
        to_email = request.user.email
        if not to_email:
            return Response({'error': 'Your account has no email address set.'}, status=400)
        from .email_utils import send_otp_email
        try:
            send_otp_email(to_email, '123456', 'register')
            return Response({'message': f'Test email sent to {to_email}.'})
        except Exception as e:
            return Response({'error': str(e)}, status=500)


# ─── Admin: User Management ───────────────────────────────────────────────────

class AdminUsersView(APIView):
    permission_classes = [IsAuthenticated]

    def _check_admin(self, user):
        if not (user.is_staff or user.is_superuser):
            return Response({'error': 'Superuser access required.'}, status=403)
        return None

    def get(self, request):
        """List all registered users with stats."""
        err = self._check_admin(request.user)
        if err: return err

        search = request.query_params.get('search', '').strip()
        status_filter = request.query_params.get('status', '')  # active | inactive | all

        users = User.objects.all().order_by('-date_joined')

        if search:
            users = users.filter(
                models.Q(username__icontains=search) |
                models.Q(email__icontains=search) |
                models.Q(first_name__icontains=search) |
                models.Q(last_name__icontains=search)
            )
        if status_filter == 'active':
            users = users.filter(is_active=True)
        elif status_filter == 'inactive':
            users = users.filter(is_active=False)

        data = []
        for u in users:
            trade_count = Trade.objects.filter(user=u).count()
            data.append({
                'id':           u.id,
                'username':     u.username,
                'email':        u.email,
                'first_name':   u.first_name,
                'last_name':    u.last_name,
                'phone':        getattr(u, 'phone', ''),
                'is_active':    u.is_active,
                'is_staff':     u.is_staff,
                'is_superuser': u.is_superuser,
                'is_verified':  getattr(u, 'is_verified', False),
                'date_joined':  u.date_joined.strftime('%Y-%m-%d'),
                'last_login':   u.last_login.strftime('%Y-%m-%d %H:%M') if u.last_login else None,
                'trade_count':  trade_count,
            })

        return Response({
            'users': data,
            'total': len(data),
            'active':   sum(1 for u in data if u['is_active']),
            'inactive': sum(1 for u in data if not u['is_active']),
        })

    def patch(self, request, user_id):
        """Toggle active/inactive or update role."""
        err = self._check_admin(request.user)
        if err: return err

        if request.user.id == user_id:
            return Response({'error': 'You cannot modify your own account here.'}, status=400)

        try:
            target = User.objects.get(pk=user_id)
        except User.DoesNotExist:
            return Response({'error': 'User not found.'}, status=404)

        # Prevent modifying another superuser
        if target.is_superuser and not request.user.is_superuser:
            return Response({'error': 'Cannot modify a superuser account.'}, status=403)

        if 'is_active' in request.data:
            target.is_active = bool(request.data['is_active'])
        if 'is_staff' in request.data:
            target.is_staff = bool(request.data['is_staff'])

        target.save()
        return Response({
            'message':   f'User {target.username} updated.',
            'is_active': target.is_active,
            'is_staff':  target.is_staff,
        })

    def delete(self, request, user_id):
        """Permanently delete a user and all their data."""
        err = self._check_admin(request.user)
        if err: return err

        if request.user.id == user_id:
            return Response({'error': 'You cannot delete your own account.'}, status=400)

        try:
            target = User.objects.get(pk=user_id)
        except User.DoesNotExist:
            return Response({'error': 'User not found.'}, status=404)

        if target.is_superuser:
            return Response({'error': 'Cannot delete a superuser account.'}, status=403)

        username = target.username
        target.delete()
        return Response({'message': f'User {username} deleted permanently.'})
