FROM python:3.11-slim

WORKDIR /app

RUN apt-get update && apt-get install -y \
    gcc \
    libffi-dev \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Install boto3 for S3/Cloud Storage
RUN pip install --no-cache-dir boto3 botocore

COPY . .

RUN mkdir -p static/uploads instance

ENV FLASK_APP=app.py
ENV PYTHONUNBUFFERED=1

EXPOSE 5001

CMD ["gunicorn", "--bind", "0.0.0.0:5001", "--workers", "4", "--threads", "2", "--worker-class", "eventlet", "app:app"]