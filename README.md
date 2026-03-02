# node-secret-service

A Dockerized Node.js web service with Basic Auth protection, deployed to AWS EC2 via a fully automated CI/CD pipeline using GitHub Actions and Amazon ECR.

---

## What the App Does

A simple but production-ready Node.js REST API with three endpoints:

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/` | GET | Returns `Hello, world!` |
| `/health` | GET | Returns `ok` — used for deployment verification |
| `/secret` | GET | Protected by Basic Auth — returns a secret message if authenticated |

The `/secret` endpoint triggers a browser login popup and returns the secret message on successful authentication, or a `401/403` error on failure.

---

## Architecture

```
Developer pushes to main branch
          │
          ▼
    GitHub Actions
    ┌─────────────────────────────┐
    │  Job 1: build-and-push      │
    │  - Checkout code            │
    │  - Authenticate with AWS    │
    │  - Build Docker image       │
    │  - Push to Amazon ECR       │
    │    (tagged with SHA+latest) │
    └────────────┬────────────────┘
                 │ needs: build-and-push
                 ▼
    ┌─────────────────────────────┐
    │  Job 2: deploy              │
    │  - SSH into EC2             │
    │  - Login to ECR             │
    │  - Pull latest image        │
    │  - Stop/remove old container│
    │  - Run new container        │
    │  - Health check /health     │
    └────────────┬────────────────┘
                 │
                 ▼
         AWS EC2 Instance
         (container running,
          accessible on port 80)
                 │
                 ▼
        Public Internet
```

---

## AWS Services Used

| Service | Purpose |
|---------|---------|
| **Amazon ECR** | Private Docker image registry — stores built images |
| **Amazon EC2** | Virtual Linux server — runs the Docker container |
| **IAM Role** | Attached to EC2, grants permission to pull from ECR without access keys |
| **IAM User** | Used by GitHub Actions to authenticate with AWS and push to ECR |
| **Security Groups** | Firewall rules — allows HTTP (80) from internet, SSH (22) for deployment |

---

## How to Run Locally

### Prerequisites
- Node.js 20+
- Docker

### Without Docker

```bash
# Clone the repo
git clone https://github.com/quandaleIV/node-secret-service.git
cd node-secret-service

# Install dependencies
npm install

# Create your .env file
cp .env.example .env
# Fill in your values in .env

# Start the server
npm run dev
```

Visit `http://localhost:3000`

### With Docker

```bash
# Build the image
docker build -t node-secret-service .

# Run the container with secrets passed at runtime
docker run -p 3000:3000 \
  -e SECRET_MESSAGE='your secret message' \
  -e USERNAME='admin' \
  -e PASSWORD='yourpassword' \
  node-secret-service
```

Visit `http://localhost:3000`

### Test the endpoints

```bash
# Homepage
curl http://localhost:3000/

# Health check
curl http://localhost:3000/health

# Secret endpoint (correct credentials)
curl -u admin:yourpassword http://localhost:3000/secret

# Secret endpoint (wrong credentials — expect 403)
curl -u admin:wrongpassword http://localhost:3000/secret
```

---

## Environment Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `PORT` | Port the server listens on | `3000` |
| `SECRET_MESSAGE` | Message returned by `/secret` when authenticated | `This is my secret` |
| `USERNAME` | Basic Auth username | `admin` |
| `PASSWORD` | Basic Auth password | `supersecret` |

Copy `.env.example` to `.env` and fill in your values. The `.env` file is gitignored and never committed.

---

## How CI/CD Works

Every push to the `main` branch triggers the GitHub Actions workflow at `.github/workflows/deploy.yml`.

### Job 1 — Build and Push

1. GitHub spins up a fresh Ubuntu runner
2. Checks out the repository code
3. Authenticates with AWS using IAM credentials stored in GitHub Secrets
4. Logs Docker into Amazon ECR
5. Builds the Docker image from the Dockerfile
6. Pushes the image to ECR with two tags:
   - `:<git-sha>` — unique tag per commit for rollback capability
   - `:latest` — always points to the newest image

### Job 2 — Deploy (runs after Job 1 succeeds)

1. Uses `appleboy/ssh-action` to SSH into the EC2 instance
2. Authenticates Docker on EC2 with ECR (using the attached IAM Role — no keys needed)
3. Pulls the latest image from ECR
4. Stops and removes the old container
5. Starts a new container with:
   - Port 80 mapped to container port 3000
   - App secrets injected as environment variables from GitHub Secrets
6. Waits 5 seconds for the app to boot
7. Hits `/health` to verify the deployment succeeded

If the health check fails, the workflow is marked as failed.

---

## Secrets Management

### Local Development
Secrets are stored in a `.env` file which is excluded from git via `.gitignore`. A `.env.example` template is provided.

### CI/CD Pipeline
All secrets are stored in GitHub Repository Secrets and injected at runtime — never hardcoded in code or baked into the Docker image.

| Secret | Used For |
|--------|---------|
| `AWS_ACCESS_KEY_ID` | GitHub Actions authenticates with AWS |
| `AWS_SECRET_ACCESS_KEY` | GitHub Actions authenticates with AWS |
| `AWS_REGION` | Target AWS region |
| `AWS_ACCOUNT_ID` | Builds ECR registry URL |
| `EC2_HOST` | SSH target — EC2 public IP |
| `EC2_SSH_KEY` | Private key for SSH into EC2 |
| `SECRET_MESSAGE` | Injected into container at runtime |
| `USERNAME` | Injected into container at runtime |
| `PASSWORD` | Injected into container at runtime |

### IAM Approach
- **GitHub Actions → ECR**: Uses IAM User access keys (stored in GitHub Secrets)
- **EC2 → ECR**: Uses an IAM Role attached directly to the EC2 instance (`ec2-ecr-pull-role`) — no long-lived credentials needed on the server

> **Note:** A future improvement is to replace the IAM User access keys with OIDC (OpenID Connect), which issues temporary credentials per workflow run and eliminates the need to store long-lived AWS keys in GitHub Secrets entirely.

---

## Docker

The app is fully containerised. Key design decisions:

- **Base image**: `node:20-alpine` — minimal Linux image, small footprint
- **Layer caching**: `package.json` is copied and `npm ci` is run before copying source code — so dependencies are only reinstalled when `package.json` changes
- **Production dependencies only**: `npm ci --omit=dev` skips devDependencies like nodemon
- **No secrets in image**: `.env` is excluded via `.dockerignore` — secrets are passed at runtime via `-e` flags
- **NODE_ENV=production**: Enables Express production optimisations

---

## Viewing Logs on EC2

SSH into the EC2 instance and use Docker's logging commands:

```bash
# SSH into EC2
ssh -i ~/.ssh/node-secret-service-key.pem ec2-user@YOUR_EC2_IP

# View live logs
docker logs node-secret-service

# Follow logs in real time
docker logs -f node-secret-service

# View last 50 lines
docker logs --tail 50 node-secret-service

# Check running containers
docker ps
```

---

## Live Endpoint

| URL | Expected Response |
|-----|------------------|
| `/` | `Hello, world!` |
| `/health` | `ok` |
| `/secret` | Login prompt → secret message |

---

## Project Structure

```
node-secret-service/
├── .github/
│   └── workflows/
│       └── deploy.yml      ← GitHub Actions CI/CD pipeline
├── src/
│   └── server.js           ← Express app with all routes
├── .dockerignore            ← excludes .env, node_modules from image
├── .env.example             ← safe template for local setup
├── .gitignore               ← excludes .env, node_modules from git
├── Dockerfile               ← container build instructions
├── package.json
└── README.md
```

---

## Tech Stack

- **Runtime**: Node.js 20
- **Framework**: Express 5
- **Containerisation**: Docker
- **Registry**: Amazon ECR
- **Hosting**: Amazon EC2 (Amazon Linux 2023, t2.micro)
- **CI/CD**: GitHub Actions
- **Auth**: HTTP Basic Authentication