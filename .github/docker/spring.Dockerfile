ARG RUNTIME_VERSION
FROM maven:3.9-eclipse-temurin-${RUNTIME_VERSION} AS build
RUN apt-get update \
    && apt-get upgrade -y \
    && rm -rf /var/lib/apt/lists/*
ARG PROJECT_PATH
WORKDIR /source
COPY ${PROJECT_PATH}/pom.xml ./pom.xml
RUN mvn --batch-mode dependency:go-offline
COPY ${PROJECT_PATH}/src ./src
RUN mvn --batch-mode package -DskipTests

FROM eclipse-temurin:${RUNTIME_VERSION}-jre
RUN apt-get update \
    && apt-get upgrade -y \
    && rm -rf /var/lib/apt/lists/*
ARG BUILD_OUTPUT
ARG APP_PORT
ARG START_COMMAND
WORKDIR /app
COPY --from=build /source/${BUILD_OUTPUT} ./app.jar
ENV START_COMMAND=${START_COMMAND}
USER 10001
EXPOSE ${APP_PORT}
CMD ["sh", "-c", "exec ${START_COMMAND}"]
