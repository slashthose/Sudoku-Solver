"""
solver.py
Backtracking Sudoku solver with step recording.
"""


def is_valid(board: list[list[int]], row: int, col: int, num: int) -> bool:
    """Check if placing `num` at (row, col) is valid."""
    
    # Check row
    for i in range(9):
        if board[row][i] == num:
            return False
    
    # Check column
    for i in range(9):
        if board[i][col] == num:
            return False
    
    # Check 3x3 box
    box_row, box_col = 3 * (row // 3), 3 * (col // 3)
    for i in range(box_row, box_row + 3):
        for j in range(box_col, box_col + 3):
            if board[i][j] == num:
                return False
    
    return True


def solve(board: list[list[int]], steps: list = None) -> bool:
    """
    Recursive backtracking solver.
    Mutates `board` in place.
    Records solver steps: [row, col, num, action].
    
    action: "place" or "remove"
    """
    if steps is None:
        steps = []
    
    for row in range(9):
        for col in range(9):
            if board[row][col] == 0:
                for num in range(1, 10):
                    if is_valid(board, row, col, num):
                        board[row][col] = num
                        steps.append([row, col, num, "place"])
                        
                        if solve(board, steps):
                            return True
                        
                        # Backtrack
                        steps.append([row, col, 0, "remove"])
                        board[row][col] = 0
                
                return False
    
    return True  # No empty cells left, solved
