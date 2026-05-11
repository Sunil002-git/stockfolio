from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import (
    RegisterView, LoginView, TokenRefreshView,
    AdminUsersView,
    BuyTradeView, SellTradeView,
    TradeGroupViewSet, TransactionViewSet,
    DashboardView, AnalyticsView, TradeHistoryView,
    BrokerViewSet, UserSettingsView,
    # New
    SendOTPView, VerifyOTPView, RegisterWithOTPView,
    ResetPasswordView, ProfileView,
    EmailConfigView, TestEmailView,
)
from .prediction_view import StockPredictionView

router = DefaultRouter()
router.register(r'positions',    TradeGroupViewSet,  basename='position')
router.register(r'transactions', TransactionViewSet, basename='transaction')
router.register(r'brokers',      BrokerViewSet,      basename='broker')

urlpatterns = [
    path('', include(router.urls)),

    # Auth
    path('register/',              RegisterView.as_view(),          name='register'),
    path('register/otp/',          RegisterWithOTPView.as_view(),   name='register-otp'),
    path('login/',                 LoginView.as_view(),             name='login'),
    path('token/refresh/',         TokenRefreshView.as_view(),      name='token-refresh'),

    # Admin user management
    path('admin/users/',           AdminUsersView.as_view(),         name='admin-users'),
    path('admin/users/<int:user_id>/', AdminUsersView.as_view(),     name='admin-user-detail'),

    # OTP
    path('otp/send/',              SendOTPView.as_view(),           name='otp-send'),
    path('otp/verify/',            VerifyOTPView.as_view(),         name='otp-verify'),

    # Password reset
    path('password/reset/',        ResetPasswordView.as_view(),     name='password-reset'),

    # Profile
    path('profile/',               ProfileView.as_view(),           name='profile'),

    # Trade
    path('trades/buy/',            BuyTradeView.as_view(),          name='buy-trade'),
    path('trades/sell/',           SellTradeView.as_view(),         name='sell-trade'),
    path('trades/history/',        TradeHistoryView.as_view(),      name='trade-history'),

    # Dashboard & analytics
    path('dashboard/',             DashboardView.as_view(),         name='dashboard'),
    path('analytics/',             AnalyticsView.as_view(),         name='analytics'),

    # Settings
    path('settings/',              UserSettingsView.as_view(),      name='user-settings'),

    # Email config (admin)
    path('email-config/',          EmailConfigView.as_view(),       name='email-config'),
    path('email-config/test/',     TestEmailView.as_view(),         name='email-test'),

    # Predict
    path('predict/',               StockPredictionView.as_view(),   name='predict'),
]
