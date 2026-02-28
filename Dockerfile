FROM python:3.11-slim

# Install R
RUN apt-get update && apt-get install -y --no-install-recommends \
    r-base \
    r-base-dev \
    libcurl4-openssl-dev \
    libssl-dev \
    libxml2-dev \
    && rm -rf /var/lib/apt/lists/*

# Install R packages
RUN R -e "install.packages(c('jsonlite', 'ggplot2', 'dplyr', 'tidyr', 'readr'), repos='https://cloud.r-project.org')"

WORKDIR /app
COPY . .

# Install Python dependencies
RUN pip install --no-cache-dir -r server/requirements.txt

EXPOSE 8000

ENV OPENFARS_SECRET=change-this-secret-key

CMD ["python", "run_server.py"]
