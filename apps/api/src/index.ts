import { app } from "./runtime.js";
const server = app.listen(Number(process.env.PORT || 4000), () =>
  console.log("ResolveFlow API listening"),
);
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => server.close(() => process.exit(0)));
