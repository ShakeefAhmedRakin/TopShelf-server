const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const express = require("express");
const cors = require("cors");
const jwt = require("jsonwebtoken");
const cookieParser = require("cookie-parser");
const axios = require("axios");
require("dotenv").config();
const app = express();
const port = process.env.PORT || 5000;

// MIDDLEWARE
app.use(
  cors({
    origin: ["http://localhost:5173"],
    credentials: true,
  })
);
app.use(express.json());
app.use(cookieParser());

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.iixzvov.mongodb.net/?retryWrites=true&w=majority`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

const verifyToken = async (req, res, next) => {
  const token = req.cookies?.token;
  if (!token) {
    return res.status(401).send({ message: "Forbidden" });
  }
  jwt.verify(token, process.env.ACCESS_TOKEN, (error, decoded) => {
    if (error) {
      console.log(error);
      return res.status(401).send({ message: "Unauthorized" });
    }
    console.log("Authorized:", decoded);
    req.user = decoded;
    next();
  });
};

async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    // await client.connect();

    const categoryCollection = client
      .db("TopShelfDB")
      .collection("categoryCollection");

    const bookCollection = client.db("TopShelfDB").collection("bookCollection");
    const borrowedCollection = client
      .db("TopShelfDB")
      .collection("borrowedCollection");

    // TOKEN AUTH API
    app.post("/jwt", async (req, res) => {
      const user = req.body;
      console.log(user);
      const token = jwt.sign(user, process.env.ACCESS_TOKEN, {
        expiresIn: "1h",
      });

      res
        .cookie("token", token, {
          httpOnly: true,
          secure: process.env.NODE_ENV === "production",
          sameSite: process.env.NODE_ENV === "production" ? "none" : "strict",
        })
        .send({ success: true });
    });

    // CATEGORY API
    app.get("/categories", async (req, res) => {
      const cursor = categoryCollection.find();
      const result = await cursor.toArray();
      res.send(result);
    });

    // BOOK POST API
    app.post("/books", async (req, res) => {
      const newBook = req.body;
      const result = await bookCollection.insertOne(newBook);
      res.send(result);
    });

    // BOOK GET API BASED ON CATEGORY
    app.get("/books/:category", async (req, res) => {
      const category = req.params.category;
      const query = { book_category: category };
      const result = await bookCollection.find(query).toArray();
      res.send(result);
    });

    // BOOK GET API BASED ON ID
    app.get("/book/:id", async (req, res) => {
      try {
        const id = req.params.id;

        if (!ObjectId.isValid(id)) {
          res.status(400).send({ error: "Invalid product ID" });
          return;
        }

        const query = { _id: new ObjectId(id) };
        const result = await bookCollection.findOne(query);

        if (!result) {
          res.status(404).send({ error: "Book not found" });
          return;
        }

        res.send(result);
      } catch (error) {
        res.status(500).send({ error: "Internal server error" });
      }
    });

    // BOOK PUT API FOR QUANTITY UPDATE
    app.put("/book/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const options = { upsert: true };
      const updated = req.body;
      const details = {
        $set: {
          book_quantity: updated.book_quantity,
        },
      };

      const result = await bookCollection.updateOne(query, details, options);
      res.send(result);
    });

    // BOOK GET API FOR BORROWED BOOKS
    const bookAPIURL = process.env.apiURL; // Replace with the correct URL

    app.get("/borrowed/:email", async (req, res) => {
      const email = req.params.email;
      const query = {
        user_email: email,
      };

      const books = await borrowedCollection.find(query).toArray();

      const result = [];

      const fetchPromises = books.map(async (book) => {
        const book_id = book.book_id;

        try {
          const response = await axios.get(`${bookAPIURL}/book/${book_id}`);
          const bookDetails = {
            return_date: book.return_date,
            borrowed_date: book.borrowed_date,
            borrowed_id: book._id,
            ...response.data,
          };

          return bookDetails;
        } catch (error) {
          console.error("Error fetching product details:", error);
          return null;
        }
      });

      Promise.all(fetchPromises)
        .then((data) => {
          result.push(...data.filter((item) => item !== null));
          res.send(result);
        })
        .catch((error) => {
          console.error("Error handling fetch promises:", error);
          res.status(500).send("Internal Server Error");
        });
    });

    // BORROWED BOOK API
    // GET API
    app.get("/borrowed", async (req, res) => {
      const cursor = borrowedCollection.find();
      const result = await cursor.toArray();
      res.send(result);
    });

    // POST API
    app.post("/borrowed", async (req, res) => {
      const borrowed = req.body;
      const { email, book_id } = borrowed;

      const existing = await borrowedCollection.findOne({ email, book_id });

      if (existing) {
        res.status(400).json({ error: "Book Already Borrowed." });
      } else {
        const result = await borrowedCollection.insertOne(borrowed);
        res.send(result);
      }
    });

    // DELETE API
    app.delete("/borrowed/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await borrowedCollection.deleteOne(query);
      res.send(result);
    });

    await client.db("admin").command({ ping: 1 });
    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!"
    );
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);

app.get("/", (req, res) => {
  res.send("Server is running.");
});

app.listen(port, (req, res) => {
  console.log(`Server listening on port: ${port}`);
});
