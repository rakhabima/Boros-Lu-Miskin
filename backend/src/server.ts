import { app } from "./app.js";
import { config } from "./config.js";

const port = Number(process.env.PORT || 4000);

app.listen(port, () => {
  console.log(`Backend running on ${config.origins.backend}`);
});
