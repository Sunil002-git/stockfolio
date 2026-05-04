from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import (
    RegisterView, LoginView,
    BuyTradeView, SellTradeView,
    TradeGroupViewSet, TransactionViewSet,
    DashboardView, AnalyticsView, TradeHistoryView,
)

router = DefaultRouter()
router.register(r'positions', TradeGroupViewSet, basename='position')
router.register(r'transactions', TransactionViewSet, basename='transaction')

urlpatterns = [
    path('', include(router.urls)),
    path('register/', RegisterView.as_view(), name='register'),
    path('login/', LoginView.as_view(), name='login'),
    path('trades/buy/', BuyTradeView.as_view(), name='buy-trade'),
    path('trades/sell/', SellTradeView.as_view(), name='sell-trade'),
    path('trades/history/', TradeHistoryView.as_view(), name='trade-history'),
    path('dashboard/', DashboardView.as_view(), name='dashboard'),
    path('analytics/', AnalyticsView.as_view(), name='analytics'),
]
