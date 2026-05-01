from django.contrib import admin
from .models import User, Trade, Journal, Transaction

# Register your models here.
admin.site.register(User)
admin.site.register(Trade)
admin.site.register(Journal)
admin.site.register(Transaction)