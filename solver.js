function isValid(board, row, col, num) {
  for (let i = 0; i < 9; i++) {
    if (board[row][i] === num) return false; // row check

    if (board[i][col] === num) return false; // column check

    const boxRow = 3 * Math.floor(row / 3) + Math.floor(i / 3);
    const boxCol = 3 * Math.floor(col / 3) + (i % 3);
    if (board[boxRow][boxCol] === num) return false; // 3x3 box check
  }
  return true;
}

/**
 * Recursive backtracking solver.
 * Mutates `board` in place. Records every place/remove action into `steps`
 * so the caller can replay the solving process as an animation later.
 *
 * @param {number[][]} board - 9x9 grid, 0 = empty cell
 * @param {Array} steps - output array, gets [row, col, num, action] pushed into it
 * @returns {boolean} true if solved
 */
function solve(board, steps) {
  for (let row = 0; row < 9; row++) {
    for (let col = 0; col < 9; col++) {
      if (board[row][col] === 0) {
        for (let num = 1; num <= 9; num++) {
          if (isValid(board, row, col, num)) {
            board[row][col] = num;
            steps.push([row, col, num, "place"]);

            if (solve(board, steps)) return true;

            steps.push([row, col, 0, "remove"]); // backtrack
            board[row][col] = 0;
          }
        }
        return false; // no valid number worked here, signal backtrack upward
      }
    }
  }
  return true; // no empty cells left, fully solved
}
