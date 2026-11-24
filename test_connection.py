import os

from dotenv import load_dotenv
from sqlalchemy import create_engine, text
from sqlalchemy.engine import URL

load_dotenv()

database_url = URL.create(
    drivername="postgresql+psycopg2",
    username=os.getenv("DB_USER"),
    password=os.getenv("DB_PASSWORD"),
    host="127.0.0.1",
    port=int(os.getenv("DB_PORT", "55441")),
    database=os.getenv("DB_NAME"),
)

engine = create_engine(database_url)

try:
    with engine.connect() as connection:
        version = connection.execute(
            text("SELECT version()")
        ).scalar_one()

        schemas = connection.execute(
            text("""
                SELECT schema_name
                FROM information_schema.schemata
                WHERE schema_name IN (
                    'raw_corn',
                    'raw_sedad',
                    'staging',
                    'analytics'
                )
                ORDER BY schema_name
            """)
        ).scalars().all()

        print("Verbindung zu BDIP erfolgreich!")
        print(f"PostgreSQL: {version.split(',')[0]}")
        print("Gefundene Schemas:")
        for schema in schemas:
            print(f" - {schema}")

except Exception as error:
    print("Datenbankverbindung fehlgeschlagen:")
    print(error)

finally:
    engine.dispose()
