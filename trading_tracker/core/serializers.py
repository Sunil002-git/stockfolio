from rest_framework import serializers
from .models import Trade, Transaction, Journal

class TradeSerializer(serializers.ModelSerializer):
    profit_loss = serializers.SerializerMethodField()

    class Meta:
        model = Trade
        fields = '__all__'

    def get_profit_loss(self, obj):
        return obj.profit_loss()
    
class TransactionSerializer(serializers.ModelSerializer):
    class Meta:
        model = Transaction
        fields = '__all__'

class JournalSerializer(serializers.ModelSerializer):
    class Meta:
        model = Journal
        fields = '__all__'