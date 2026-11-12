import os
from supabase import create_client, Client
from dotenv import load_dotenv

# .env file load karo
load_dotenv()

# Supabase Client Initialize karo
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")

if not SUPABASE_URL or not SUPABASE_KEY:
    raise ValueError("Supabase URL or Key missing in .env file")

supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

def init_db():
    # Supabase tables are already created using SQl editor
    # They was only check is wroking properly or not 
    try:
        response = supabase.table("users").select("id").limit(1).execute()
        print("✅ Supabase connected successfully!")
    except Exception as e:
        print(f"❌ Supabase connection error: {e}")