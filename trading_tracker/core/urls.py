from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import (
    RegisterView,
    LoginView,
    TradeViewSet,
    TransactionViewSet,
    JournalViewSet,
    DashboardView,
    DailyReportView,
    MonthlyReportView,
)

router = DefaultRouter()
router.register(r'trades', TradeViewSet, basename='trade')
router.register(r'transactions', TransactionViewSet, basename='transaction')
router.register(r'journals', JournalViewSet, basename='journal')

urlpatterns = [
    path('', include(router.urls)),
    path('register/', RegisterView.as_view(), name='register'),
    path('login/', LoginView.as_view(), name='login'),
    path('dashboard/', DashboardView.as_view(), name='dashboard'),
    path('daily-report/', DailyReportView.as_view(), name='daily-report'),
    path('monthly-report/', MonthlyReportView.as_view(), name='monthly-report'),
]
