# TrainingDevops app

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
