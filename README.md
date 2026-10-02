# Smart Food Manager

Express serves the frontend and API from one Node.js service. MongoDB is used for persistent application data.

## Deploy to Github

1. Push this project to a Git repository.
2. Set `MONGODB_URI` in the Render service environment to the Atlas URI shown in `.env.example`, replacing `<db_password>` with the database user's actual password. If the password contains reserved URL characters, percent-encode them. Keep the password out of Git and allow Render to reach the database in Atlas network access settings.
3. Render generates `JWT_SECRET` from the Blueprint. Keep it private and do not commit production secrets.
4. Deploy. The service runs `npm ci`, then `npm start`; Render checks `/api/health`.
5. Open the Render service URL. The Express service serves both the frontend and `/api` routes, so the browser does not need a separate API URL or CORS configuration.
6. To load the demo records and demo login, run `npm run seed` once against the empty hosted database from a trusted environment configured with that database's `MONGODB_URI`. Do not run it after real data has been added.


## Run locally

1. Install Node.js 24 and MongoDB, then copy `.env.example` to `.env`, replace `<db_password>` in `MONGODB_URI`, and adjust the remaining values if needed. For local MongoDB, use `mongodb://127.0.0.1:27017/smart_food_manager` instead.
2. Run `npm install`, then `npm run dev` (or `npm start`). Open `http://localhost:5000`.
3. To populate demo records, run `npm run seed` after configuring `MONGODB_URI`.

> **Warning:** `npm run seed` deletes the existing users, menus, consumption, waste, NGO, and donation collections before inserting demo data. Run it only once against a new, empty database. Never run it against a database containing data you need to keep.

The demo administrator created by the seed script is `admin@smartfood.edu` with password `admin123`. Change or remove this demo account before using the application with real users.