async function extractGridFromImage(base64Image) {
  const response = await fetch(
    "3b8cbeb9ae62420f97621e70876bd81d.b8GsZ3gl9lVsvu2A4UrI5fD0",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 500,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "image",
                source: {
                  type: "base64",
                  media_type: "image/jpeg",
                  data: base64Image,
                },
              },
              {
                type: "text",
                text: `Look at this Sudoku grid. Return ONLY a JSON array of 9 arrays (rows), each with 9 numbers. Use 0 for empty cells. Example: [[5,3,0,0,7,0,0,0,0],[6,0,0,1,9,5,0,0,0],...]. No explanation.`,
              },
            ],
          },
        ],
      }),
    },
  );

  const data = await response.json();
  const text = data.content[0].text.trim();
  return JSON.parse(text); // → 9×9 array
}
