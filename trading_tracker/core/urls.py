from .views import LoginView, DashboardView, DailyReportView, MonthlyReportView
from django.contrib import admin
from django.urls import path

urlpatterns = [
    path('login/', LoginView.as_view(), name='login',),
    path('dashboard', DashboardView.as_view()),
    path('daily-report/', DailyReportView.as_view()),
    path('monthly-report/', MonthlyReportView.as_view())
]