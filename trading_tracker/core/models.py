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

    user = models.ForeignKey(User, on_delete=models.CASCADE)
    type = models.CharField(max_length=10, choices=TRANSACTION_TYPES)
    amount = models.FloatField()
    date = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.user.username} - {self.type} - {self.amount}"


class Trade(models.Model):
    TRADE_TYPES = (
        ('buy', 'Buy'),
        ('sell', 'Sell'),
    )

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

    user = models.ForeignKey(User, on_delete=models.CASCADE)

    # Core fields
    symbol = models.CharField(max_length=100)
    trade_type = models.CharField(max_length=10, choices=TRADE_TYPES, default='buy')
    segment = models.CharField(max_length=10, choices=SEGMENT_CHOICES, default='equity')
    exchange = models.CharField(max_length=10, choices=EXCHANGE_CHOICES, default='NSE')

    # Price & Quantity
    buy_price = models.FloatField()
    sell_price = models.FloatField(null=True, blank=True)
    quantity = models.IntegerField()
    charges = models.FloatField(default=0)

    # F&O specific fields
    strike_price = models.FloatField(null=True, blank=True)
    expiry_date = models.DateField(null=True, blank=True)
    lot_size = models.IntegerField(null=True, blank=True)

    # Mutual Fund specific
    nav = models.FloatField(null=True, blank=True, help_text="Net Asset Value for MF")
    fund_house = models.CharField(max_length=100, null=True, blank=True)

    # Notes
    notes = models.TextField(null=True, blank=True)
    date = models.DateField()

    class Meta:
        ordering = ['-date']

    def profit_loss(self):
        if self.sell_price:
            return (self.sell_price - self.buy_price) * self.quantity - self.charges
        return None

    def invested_amount(self):
        return self.buy_price * self.quantity

    def __str__(self):
        return f"{self.symbol} ({self.segment}) - {self.user.username}"


class Journal(models.Model):
    trade = models.OneToOneField(Trade, on_delete=models.CASCADE, related_name='journal')
    reason = models.TextField()
    mistake = models.TextField(blank=True)
    lesson = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"Journal for {self.trade.symbol}"
