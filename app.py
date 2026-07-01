"""
Sudoku Solver Backend — FastAPI
Extracts grid from image + solves locally, sends back grid + solution.
"""

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import base64
import io
import numpy as np
from grid_detector import extract_grid_from_image
from solver import solve

app = FastAPI()

# CORS: allow requests from your deployed frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # In production, lock this down to your domain
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class ImagePayload(BaseModel):
    """Base64-encoded image from webcam"""
    image: str

class SolverResponse(BaseModel):
    """Response with extracted grid and solution"""
    success: bool
    grid: list[list[int]] | None = None
    solution: list[list[int]] | None = None
    steps: list[list] | None = None  # Changed: allows mixed types (int and str)
    error: str | None = None
    message: str = ""

@app.get("/health")
def health():
    """Simple health check for Railway"""
    return {"status": "ok"}


@app.post("/extract-and-solve")
async def extract_and_solve(payload: ImagePayload) -> SolverResponse:
    """
    Receives base64 image → extracts Sudoku grid → solves → returns grid + solution.

    Expected payload:
    {
        "image": "data:image/jpeg;base64,/9j/4AAQSkZ..." (or just the base64 part)
    }

    Returns:
    {
        "success": true/false,
        "grid": [[5,3,0,...], ...],       // extracted grid
        "solution": [[5,3,4,...], ...],   // solved grid
        "steps": [[0,1,4,"place"], ...],  // solver steps (optional, for animation)
        "error": null or "error message",
        "message": "Grid extracted and solved in Xms"
    }
    """
    try:
        # Parse base64 image
        image_data = payload.image

        # Remove data URI prefix if present
        if image_data.startswith("data:image"):
            image_data = image_data.split(",")[1]

        # Decode to bytes
        image_bytes = base64.b64decode(image_data)
        image_stream = io.BytesIO(image_bytes)

        # Extract grid from image
        grid = extract_grid_from_image(image_stream)

        if grid is None:
            return SolverResponse(
                success=False,
                error="Could not detect Sudoku grid in image. Ensure the grid is clearly visible.",
                message="Grid detection failed"
            )

        # Validate grid
        if not isinstance(grid, list) or len(grid) != 9 or not all(len(row) == 9 for row in grid):
            return SolverResponse(
                success=False,
                error="Invalid grid format detected",
                message="Grid validation failed"
            )

        # Make a copy for solving
        grid_to_solve = [row[:] for row in grid]
        steps = []

        # Solve
        solved = solve(grid_to_solve, steps)

        if not solved:
            return SolverResponse(
                success=False,
                error="No solution found. Check if the puzzle is valid.",
                message="Solver failed"
            )

        return SolverResponse(
            success=True,
            grid=grid,
            solution=grid_to_solve,
            steps=steps,
            message=f"Grid extracted and solved ({len(steps)} backtrack steps)"
        )

    except ValueError as e:
        return SolverResponse(
            success=False,
            error=f"Invalid input: {str(e)}",
            message="Input validation failed"
        )
    except Exception as e:
        return SolverResponse(
            success=False,
            error=str(e),
            message="Server error"
        )


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8001)
