# Technical Documentation & Deployment Manual
1. System Requirements

To deploy the TrainingDevopsPlan infrastructure, the target host must meet the following specifications:

    Operating System: Linux (Debian/Ubuntu recommended), macOS, or Windows with WSL2.

    Runtime: Docker Engine 24.0+ and Docker Compose v2.0+.

    Hardware: Minimum 1 vCPU, 2GB RAM (4GB recommended for build processes).

    Network: Outbound internet access (for fetching Docker images and Garmin API synchronization).

2. Configuration Parameters

The application requires specific environment variables for database connectivity and external API authentication.

Action: Create a file named .env in the root directory:

    touch .env

Required Variables:
Ini, TOML

# Database Configuration
User for the PostgreSQL instance (arbitrary, but must match)
POSTGRES_USER=devuser
Strong password for the database user
POSTGRES_PASSWORD=secure_password_here
Name of the database to initialize
POSTGRES_DB=fitness_data

# Worker Service Configuration
Your Garmin Connect login email
GARMIN_USER=email@example.com
Your Garmin Connect password
GARMIN_PASS=your_garmin_password

# Registry Configuration
GitHub Username for pulling images
IMAGE_OWNER=sebastiendesalle
Repository Name
REPO_NAME=trainingdevopsplan

3. Deployment Instructions
Production

This method is recommended for the production server (e.g., MiniPC). It pulls optimized images from the GitHub Container Registry.

    Pull the latest images:
    docker compose pull

Start the services in detached mode:

    docker compose up -d

Verify container status:

    docker compose ps
    Ensure api, web, worker, db, and traefik are all Up.

4. Access Points & Remote Connectivity

Once deployed, the infrastructure exposes services via a Traefik reverse proxy and a secure Cloudflare Tunnel.
Local Access
Service	Internal Port	External Route	Description
Frontend	80	http://localhost:8080/	Main User Interface
API	3000	http://localhost:8080/api	Backend endpoints
Traefik	8080	http://localhost:8081/	Routing Dashboard
Remote Access (Cloudflare Tunnel)

This project uses a Cloudflare Tunnel to provide secure, HTTPS access from outside the local network without opening router ports.

To retrieve the public URL:

    SSH into the production server (MiniPC).

    Retrieve the logs from the tunnel container:
    Bash

    docker logs production-training-app-tunnel-1

    Locate the URL in the output box (e.g., https://random-name.trycloudflare.com).

# TrainingDevops App
Project Overview

This repository contains a full-stack, containerized application designed to track training progress for the Antwerp 10 Miles, Antwerp Marathon, and Ironman Barcelona. The project demonstrates a complete DevOps lifecycle, including a microservices architecture, automated CI/CD pipelines, and self-hosted infrastructure implementation.
Architecture

The application consists of four distinct services orchestrated via Docker Compose:

    Frontend: A React application built with Vite and TypeScript that provides the user interface for training logs and plans.

    API: An Express (TypeScript) backend service that interfaces with the database and serves data to the frontend.

    Worker: A background service (Node.js/TypeScript) that runs independently to fetch activity data from Garmin Connect and populate the database.

    Database: A PostgreSQL container for persistent data storage.

    Reverse Proxy: Traefik is configured to route traffic to the appropriate services (api requests to the backend, other traffic to the frontend).

Technology Stack

    Languages: TypeScript, HTML, CSS

    Framework: Express

    Containerization: Docker, Docker Compose

    CI/CD: GitHub Actions, GitHub Container Registry (GHCR)

    Infrastructure: Self-hosted runner on Linux (CasaOS)

CI/CD Pipeline

The project utilizes GitHub Actions for continuous integration and deployment.

    Build & Push: Commits to the main branch trigger a workflow that builds Docker images for the Web, API, and Worker services. These images are pushed to the GitHub Container Registry (GHCR).

    Deployment: Upon successful upload, a secondary workflow triggers on the self-hosted runner. This pulls the updated images and restarts the containers.

Infrastructure Note

The application is hosted on a MiniPC running CasaOS.
Features

    Automated Synchronization: The worker service runs on a 30-minute interval to fetch and sync new activities from Garmin.

    Data Persistence: Database storage is mounted to a persistent volume to ensure data retention across container restarts.

    Microservices Design: The API and Worker services are decoupled to allow for independent maintenance and scaling.

# For Clarity: readme has been written by me but refined and clarified due to complexity by AI and takes heavy inspiration from the MariaDB docker image readme
