from django.db import models
from django.contrib.auth.models import AbstractUser


class User(AbstractUser):
    is_verified = models.BooleanField(default=False)

    def __str__(self):
        return self.username


class Transaction(models.Model):
    TRANSACTION_TYPES = (
        ('deposit', 'Deposit'),
        ('withdraw', 'Withdraw'),
    )
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='transactions')
    type = models.CharField(max_length=10, choices=TRANSACTION_TYPES)
    amount = models.FloatField()
    note = models.CharField(max_length=255, blank=True)
    date = models.DateField()
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-date', '-created_at']

    def __str__(self):
        return f"{self.user.username} - {self.type} - ₹{self.amount}"


class TradeGroup(models.Model):
    """
    Groups multiple buy lots of the same symbol together.
    Tracks average cost automatically as lots are added.
    Example: Buy 10 RELIANCE @ ₹100, then Buy 5 @ ₹90
             avg_cost = (10×100 + 5×90) / 15 = ₹96.67
    """
    SEGMENT_CHOICES = (
        ('equity', 'Equity (Stock)'),
        ('futures', 'Futures'),
        ('ce', 'Call Option (CE)'),
        ('pe', 'Put Option (PE)'),
        ('mf', 'Mutual Fund'),
    )
    EXCHANGE_CHOICES = (
        ('NSE', 'NSE'),
        ('BSE', 'BSE'),
        ('MCX', 'MCX'),
        ('NFO', 'NFO'),
        ('BFO', 'BFO'),
    )

    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='trade_groups')
    symbol = models.CharField(max_length=100)
    segment = models.CharField(max_length=10, choices=SEGMENT_CHOICES, default='equity')
    exchange = models.CharField(max_length=10, choices=EXCHANGE_CHOICES, default='NSE')

    # Computed fields — updated on every buy/sell
    total_quantity = models.IntegerField(default=0)       # remaining open qty
    avg_cost = models.FloatField(default=0)               # weighted avg buy price
    total_invested = models.FloatField(default=0)         # total capital in this group

    # F&O specifics
    strike_price = models.FloatField(null=True, blank=True)
    expiry_date = models.DateField(null=True, blank=True)
    lot_size = models.IntegerField(null=True, blank=True)

    # MF specifics
    fund_house = models.CharField(max_length=100, blank=True)

    is_closed = models.BooleanField(default=False)  # True when all qty sold
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-updated_at']

    def recalculate(self):
        """Recalculate avg_cost and total_quantity from all buy trades."""
        buys = self.trades.filter(trade_type='buy')
        total_qty = sum(t.quantity for t in buys)
        total_cost = sum(t.buy_price * t.quantity for t in buys)
        sells = self.trades.filter(trade_type='sell')
        sold_qty = sum(t.quantity for t in sells)

        self.total_quantity = total_qty - sold_qty
        self.avg_cost = total_cost / total_qty if total_qty > 0 else 0
        self.total_invested = self.avg_cost * self.total_quantity
        self.is_closed = self.total_quantity <= 0
        self.save()

    def realized_pl(self):
        sells = self.trades.filter(trade_type='sell')
        pl = 0
        for s in sells:
            pl += (s.sell_price - self.avg_cost) * s.quantity - s.charges
        return pl

    def __str__(self):
        return f"{self.symbol} ({self.segment}) - {self.user.username}"


class Trade(models.Model):
    TRADE_TYPES = (
        ('buy', 'Buy'),
        ('sell', 'Sell'),
    )

    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='trades')
    group = models.ForeignKey(
        TradeGroup, on_delete=models.CASCADE,
        related_name='trades', null=True, blank=True
    )

    trade_type = models.CharField(max_length=10, choices=TRADE_TYPES, default='buy')

    # Buy fields
    buy_price = models.FloatField(null=True, blank=True)

    # Sell fields (only for sell entries)
    sell_price = models.FloatField(null=True, blank=True)

    quantity = models.IntegerField()
    charges = models.FloatField(default=0)
    date = models.DateField()
    notes = models.TextField(blank=True)

    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-date', '-created_at']

    def profit_loss(self):
        """For sell trades: P&L based on group avg_cost."""
        if self.trade_type == 'sell' and self.sell_price and self.group:
            return (self.sell_price - self.group.avg_cost) * self.quantity - self.charges
        return None

    def __str__(self):
        symbol = self.group.symbol if self.group else "Unknown"
        return f"{symbol} {self.trade_type} x{self.quantity} - {self.user.username}"


class Journal(models.Model):
    trade = models.OneToOneField(Trade, on_delete=models.CASCADE, related_name='journal')
    reason = models.TextField()
    mistake = models.TextField(blank=True)
    lesson = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"Journal for {self.trade}"
