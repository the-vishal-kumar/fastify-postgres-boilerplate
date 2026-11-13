// Kept out of index.html so the Content-Security-Policy can forbid inline scripts.
window.onload = function () {
  window.ui = SwaggerUIBundle({
    url: '/docs/openapi.json',
    dom_id: '#swagger-ui',
    deepLinking: true,
    persistAuthorization: true,
    displayRequestDuration: true,
    tryItOutEnabled: true,
    defaultModelsExpandDepth: 0,
  });
};
