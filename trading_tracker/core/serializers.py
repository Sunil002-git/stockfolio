from rest_framework import serializers
from django.contrib.auth.password_validation import validate_password
from .models import Trade, TradeGroup, Transaction, Journal, User, Broker, UserSettings


# ─── Auth ────────────────────────────────────────────────────────────────────

class RegisterSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True, required=True, validators=[validate_password])
    password2 = serializers.CharField(write_only=True, required=True, label="Confirm Password")

    class Meta:
        model = User
        fields = ('username', 'email', 'first_name', 'last_name', 'password', 'password2')

    def validate(self, attrs):
        if attrs['password'] != attrs['password2']:
            raise serializers.ValidationError({"password": "Passwords do not match."})
        return attrs

    def create(self, validated_data):
        validated_data.pop('password2')
        return User.objects.create_user(**validated_data)


# ─── Trade ───────────────────────────────────────────────────────────────────

class TradeSerializer(serializers.ModelSerializer):
    profit_loss = serializers.SerializerMethodField()
    avg_cost = serializers.SerializerMethodField()

    class Meta:
        model = Trade
        fields = '__all__'
        read_only_fields = ('user',)

    def get_profit_loss(self, obj):
        return obj.profit_loss()

    def get_avg_cost(self, obj):
        return obj.group.avg_cost if obj.group else None


# ─── TradeGroup ───────────────────────────────────────────────────────────────

class TradeGroupSerializer(serializers.ModelSerializer):
    trades = TradeSerializer(many=True, read_only=True)
    realized_pl = serializers.SerializerMethodField()
    unrealized_pl = serializers.SerializerMethodField()

    class Meta:
        model = TradeGroup
        fields = '__all__'
        read_only_fields = ('user', 'avg_cost', 'total_quantity', 'total_invested', 'is_closed')

    def get_realized_pl(self, obj):
        return obj.realized_pl()

    def get_unrealized_pl(self, obj):
        # Placeholder — needs live price to calculate
        return None


class TradeGroupSummarySerializer(serializers.ModelSerializer):
    """Lightweight serializer for the positions list."""
    realized_pl = serializers.SerializerMethodField()
    buy_count = serializers.SerializerMethodField()
    sell_count = serializers.SerializerMethodField()

    class Meta:
        model = TradeGroup
        fields = [
            'id', 'symbol', 'segment', 'exchange',
            'total_quantity', 'avg_cost', 'total_invested',
            'is_closed', 'realized_pl', 'buy_count', 'sell_count',
            'strike_price', 'expiry_date', 'lot_size', 'fund_house',
            'created_at', 'updated_at',
        ]

    def get_realized_pl(self, obj):
        return obj.realized_pl()

    def get_buy_count(self, obj):
        return obj.trades.filter(trade_type='buy').count()

    def get_sell_count(self, obj):
        return obj.trades.filter(trade_type='sell').count()


# ─── Buy / Sell entry serializers ─────────────────────────────────────────────

class BuyTradeSerializer(serializers.Serializer):
    """Create a buy entry. Creates or finds an existing open TradeGroup."""
    symbol = serializers.CharField(max_length=100)
    segment = serializers.ChoiceField(choices=['equity', 'futures', 'ce', 'pe', 'mf'])
    exchange = serializers.ChoiceField(choices=['NSE', 'BSE', 'MCX', 'NFO', 'BFO'])
    buy_price = serializers.FloatField(min_value=0)
    quantity = serializers.IntegerField(min_value=1)
    charges = serializers.FloatField(default=0, min_value=0)
    date = serializers.DateField()
    notes = serializers.CharField(required=False, allow_blank=True, default='')
    # F&O
    strike_price = serializers.FloatField(required=False, allow_null=True)
    expiry_date = serializers.DateField(required=False, allow_null=True)
    lot_size = serializers.IntegerField(required=False, allow_null=True)
    # MF
    fund_house = serializers.CharField(required=False, allow_blank=True, default='')


class SellTradeSerializer(serializers.Serializer):
    """Log a sell against an existing TradeGroup."""
    group_id = serializers.IntegerField()
    sell_price = serializers.FloatField(min_value=0)
    quantity = serializers.IntegerField(min_value=1)
    charges = serializers.FloatField(default=0, min_value=0)
    date = serializers.DateField()
    notes = serializers.CharField(required=False, allow_blank=True, default='')

    def validate(self, attrs):
        try:
            group = TradeGroup.objects.get(pk=attrs['group_id'])
        except TradeGroup.DoesNotExist:
            raise serializers.ValidationError({"group_id": "Position not found."})
        if group.is_closed:
            raise serializers.ValidationError({"group_id": "This position is already fully closed."})
        if attrs['quantity'] > group.total_quantity:
            raise serializers.ValidationError({
                "quantity": f"You only have {group.total_quantity} units available to sell."
            })
        attrs['group'] = group
        return attrs


# ─── Transaction ─────────────────────────────────────────────────────────────

class TransactionSerializer(serializers.ModelSerializer):
    broker_name = serializers.SerializerMethodField()
    broker_id   = serializers.PrimaryKeyRelatedField(
        queryset=Broker.objects.all(), source='broker', allow_null=True, required=False
    )

    class Meta:
        model = Transaction
        fields = ['id', 'type', 'amount', 'note', 'date', 'created_at', 'broker_id', 'broker_name']
        read_only_fields = ('user', 'created_at', 'broker_name')

    def get_broker_name(self, obj):
        return obj.broker.name if obj.broker else None


# ─── Journal ─────────────────────────────────────────────────────────────────

class JournalSerializer(serializers.ModelSerializer):
    class Meta:
        model = Journal
        fields = '__all__'


# ─── Broker ──────────────────────────────────────────────────────────────────

class BrokerSerializer(serializers.ModelSerializer):
    trade_count = serializers.SerializerMethodField()

    class Meta:
        model = Broker
        fields = ['id', 'name', 'account_id', 'notes', 'is_active', 'created_at', 'trade_count']
        read_only_fields = ('user', 'created_at')

    def get_trade_count(self, obj):
        return obj.trades.count()


# ─── UserSettings ─────────────────────────────────────────────────────────────

class UserSettingsSerializer(serializers.ModelSerializer):
    class Meta:
        model = UserSettings
        fields = ['predict_from_date', 'predict_to_date', 'default_exchange', 'default_segment', 'updated_at']
        read_only_fields = ('updated_at',)
