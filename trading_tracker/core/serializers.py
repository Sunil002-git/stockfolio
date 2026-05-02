from rest_framework import serializers
from django.contrib.auth.password_validation import validate_password
from .models import Trade, Transaction, Journal, User


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
        user = User.objects.create_user(**validated_data)
        return user


class TradeSerializer(serializers.ModelSerializer):
    profit_loss = serializers.SerializerMethodField()
    invested_amount = serializers.SerializerMethodField()

    class Meta:
        model = Trade
        fields = '__all__'
        read_only_fields = ('user',)

    def get_profit_loss(self, obj):
        return obj.profit_loss()

    def get_invested_amount(self, obj):
        return obj.invested_amount()


class TransactionSerializer(serializers.ModelSerializer):
    class Meta:
        model = Transaction
        fields = '__all__'
        read_only_fields = ('user',)


class JournalSerializer(serializers.ModelSerializer):
    class Meta:
        model = Journal
        fields = '__all__'
