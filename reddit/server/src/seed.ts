import { db } from "./db";

async function seed() {
  const dummyPosts = [
    { id: 1n, title: "First post", url: "https://example.com/1", voteCount: 10n },
    {
      id: 2n,
      title: "Second post",
      url: "https://example.com/1",
      voteCount: 890n,
    },
    { id: 3n, title: "Third post", url: "https://example.com/1", voteCount: 14n },
    {
      id: 4n,
      title: "Fourth post",
      url: "https://example.com/1",
      voteCount: 12n,
    },
  ];

  for (const post of dummyPosts) {
    await db.insertInto("post").values(post).execute();
  }
  console.log("Dummy data inserted successfully");
}

seed()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Error seeding data:", err);
    process.exit(1);
  });
