import boto3
import psycopg2
import dagster as dg


class PostgresResource(dg.ConfigurableResource):
    database_url: str = dg.EnvVar("DATABASE_URL")

    def get_connection(self):
        return psycopg2.connect(self.database_url)


class ObjectStoreResource(dg.ConfigurableResource):
    endpoint: str = dg.EnvVar("S3_ENDPOINT")
    access_key: str = dg.EnvVar("S3_ACCESS_KEY")
    secret_key: str = dg.EnvVar("S3_SECRET_KEY")

    def get_s3_client(self):
        return boto3.client(
            "s3",
            endpoint_url=self.endpoint,
            aws_access_key_id=self.access_key,
            aws_secret_access_key=self.secret_key,
        )


class TaigaResource(dg.ConfigurableResource):
    endpoint: str = dg.EnvVar("TAIGA_ENDPOINT")
    access_key: str = dg.EnvVar("TAIGA_ACCESS_KEY")
    secret_key: str = dg.EnvVar("TAIGA_SECRET_KEY")

    def get_s3_client(self):
        return boto3.client(
            "s3",
            endpoint_url=self.endpoint,
            aws_access_key_id=self.access_key,
            aws_secret_access_key=self.secret_key,
        )