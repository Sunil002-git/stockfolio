from django.db import models
from django.contrib.auth.models import AbstractUser
# Create your models here.

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
        ('stock', 'Stock'),
        ('ce', 'Call Option'),
        ('pe', 'Put Option'),
    )

    user = models.ForeignKey(User, on_delete=models.CASCADE)

    symbol = models.CharField(max_length=50)
    trade_type = models.CharField(max_length=10, choices=TRADE_TYPES)

    buy_price = models.FloatField()
    sell_price = models.FloatField(null=True, blank=True)

    quantity = models.IntegerField()
    charges = models.FloatField(default=0)

    date = models.DateField()

    def profit_loss(self):
        if self.sell_price:
            return (self.sell_price - self.buy_price) * self.quantity - self.charges
        return 0
    
    def __str__(self):
        return f"{self.symbol} - {self.user.username}"
    
class Journal(models.Model):
    trade = models.ForeignKey(Trade, on_delete=models.CASCADE)

    reason = models.TextField()
    mistake = models.TextField()

    def __str__(self):
        return f"Journal for {self.trade.symbol}"
    