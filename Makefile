COMPOSE_FILE=docker-compose.yml

.PHONY: up down db-migrate db-studio logs test
up:
	docker compose -f $(COMPOSE_FILE) up --build

down:
	docker compose -f $(COMPOSE_FILE) down

db-migrate:
	docker compose -f $(COMPOSE_FILE) run --rm api npx prisma migrate dev --name init

db-studio:
	docker compose -f $(COMPOSE_FILE) run --rm api npx prisma studio

logs:
	docker compose -f $(COMPOSE_FILE) logs -f

test:
	docker compose -f $(COMPOSE_FILE) run --rm api npm test

