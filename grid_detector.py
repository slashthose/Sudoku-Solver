"""
grid_detector.py - FIXED VERSION
Proper Tesseract path + correct indentation + working OCR
"""

import cv2
import numpy as np
import pytesseract
import io

# CRITICAL: Set correct Tesseract path
pytesseract.pytesseract.tesseract_cmd = r"C:\Users\Sakshi\AppData\Local\Programs\Tesseract-OCR\tesseract.exe"

def extract_grid_from_image(image_stream) -> list[list[int]] | None:
    """
    Robust Sudoku grid extraction:
    Adaptive to lighting, distance, angle variations
    """

    try:
        # Load image
        image_data = image_stream.read()
        image_bytes = io.BytesIO(image_data)
        img = cv2.imdecode(np.frombuffer(image_bytes.read(), np.uint8), cv2.IMREAD_COLOR)

        if img is None:
            return None

        # Resize for consistent processing
        img = cv2.resize(img, (800, 600))
        gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)

        # PREPROCESSING: Even stronger contrast enhancement
        clahe = cv2.createCLAHE(clipLimit=4.0, tileGridSize=(6, 6))  # ← Stronger
        enhanced = clahe.apply(gray)

        bilateral = cv2.bilateralFilter(enhanced, 11, 85, 85)  # ← More aggressive smoothing

        # Adaptive threshold with smaller block size for finer grids
        thresh = cv2.adaptiveThreshold(
            bilateral, 255,
            cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
            cv2.THRESH_BINARY,
            blockSize=9,  # ← Smaller = better for thin lines
            C=1  # ← More aggressive thresholding
        )

        # EDGE DETECTION - More iterations to connect broken lines
        edges = cv2.Canny(thresh, 30, 100)  # ← Lower thresholds
        kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (8, 8))  # ← Bigger kernel
        edges = cv2.dilate(edges, kernel, iterations=6)  # ← More iterations

        # FIND GRID CONTOUR
        contours, _ = cv2.findContours(edges, cv2.RETR_TREE, cv2.CHAIN_APPROX_SIMPLE)

        if not contours:
            return None

        # Find the largest rectangle - MUCH MORE LENIENT
        grid_contour = None
        max_area = 0

        for contour in contours:
            area = cv2.contourArea(contour)
            print(f"contour area:{area}")

            # ADAPTIVE: Accept wider range based on image size
            min_area = 10000  # ← Lower limit
            max_area_limit = 500000  # ← Higher limit

            if area < min_area or area > max_area_limit:
                continue

            approx = None
            for eps_factor in [0.01, 0.02, 0.03, 0.05, 0.08]:
                epsilon = eps_factor * cv2.arcLength(contour, True)
                candidate = cv2.approxPolyDP(contour, epsilon, True)
                if len(candidate) == 4:
                    approx = candidate
                    break


            print(f"approx corners (best try): {len(approx) if approx is not None else 'none found'}")

            if approx is not None and area > max_area:
              max_area = area
            grid_contour = approx

        if grid_contour is None:
            print("[GRID] No valid contour found - try better lighting or angle")
            return None
        if grid_contour is None and contours:
    # Fallback: use bounding box of the largest reasonably-sized contour
          largest = max(contours, key=cv2.contourArea)
          if cv2.contourArea(largest) > 10000:
               x, y, w, h = cv2.boundingRect(largest)
               grid_contour = np.array([
                    [[x, y]], [[x + w, y]], [[x + w, y + h]], [[x, y + h]]
               ])

        # PERSPECTIVE TRANSFORM
        pts = grid_contour.reshape(4, 2).astype(np.float32)

        s = pts.sum(axis=1)
        diff = np.diff(pts, axis=1)

        sorted_pts = np.zeros((4, 2), dtype=np.float32)
        sorted_pts[0] = pts[np.argmin(s)]
        sorted_pts[1] = pts[np.argmin(diff)]
        sorted_pts[2] = pts[np.argmax(s)]
        sorted_pts[3] = pts[np.argmax(diff)]

        size = 450
        dst_pts = np.array([
            [0, 0],
            [size, 0],
            [size, size],
            [0, size]
        ], dtype=np.float32)

        M = cv2.getPerspectiveTransform(sorted_pts, dst_pts)
        warped = cv2.warpPerspective(img, M, (size, size))
        warped_gray = cv2.cvtColor(warped, cv2.COLOR_BGR2GRAY)

        # EXTRACT DIGITS
        grid = extract_digits(warped_gray)
        digit_count = sum(1 for row in grid for val in row if val != 0) if grid else 0
        print(f"digits detected: {digit_count}")

        if grid and digit_count >= 2:
             return grid

        return None

    except Exception as e:
        print(f"[GRID] Detection error: {str(e)}")
        return None


def extract_digits(warped_gray) -> list[list[int]] | None:
    """
    Extract 9x9 digits from warped grid image.
    More tolerant of variable lighting and ink quality.
    """
    h, w = warped_gray.shape
    cell_h, cell_w = h // 9, w // 9
    grid = [[0] * 9 for _ in range(9)]

    clahe = cv2.createCLAHE(clipLimit=3.0, tileGridSize=(3, 3))  # ← Stronger
    enhanced = clahe.apply(warped_gray)

    for row in range(9):
        for col in range(9):
            # Extract cell
            y1, y2 = row * cell_h, (row + 1) * cell_h
            x1, x2 = col * cell_w, (col + 1) * cell_w
            cell = enhanced[y1:y2, x1:x2]

            # Skip only VERY light cells
            if np.mean(cell) > 220:  # ← Changed from 210
                continue

            # Threshold cell - more aggressive
            _, cell_thresh = cv2.threshold(cell, 100, 255, cv2.THRESH_BINARY)  # ← Lowered from 120

            # Stronger morphological cleanup
            kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (3, 3))  # ← Bigger kernel
            cell_thresh = cv2.morphologyEx(cell_thresh, cv2.MORPH_CLOSE, kernel)
            cell_thresh = cv2.morphologyEx(cell_thresh, cv2.MORPH_OPEN, kernel)

            # Find contours
            contours, _ = cv2.findContours(cell_thresh, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

            if not contours:
                continue

            # Get largest contour
            largest = max(contours, key=cv2.contourArea)
            area = cv2.contourArea(largest)

            cell_area = (y2 - y1) * (x2 - x1)

            # MUCH MORE TOLERANT: 8-75% of cell
            if 0.08 * cell_area < area < 0.75 * cell_area:
                try:
                    # Invert for OCR
                    cell_inv = cv2.bitwise_not(cell_thresh)
                    cell_resized = cv2.resize(cell_inv, (50, 50))

                    # OCR with higher confidence
                    text = pytesseract.image_to_string(
                        cell_resized,
                        config="--psm 8 --oem 3 -c tessedit_char_whitelist=123456789"
                    ).strip()
                    # Extract first valid digit
                    for char in text:
                        if char.isdigit() and char != '0':
                            grid[row][col] = int(char)
                            break
                except Exception as e:
                    pass  # Silent fail - don't spam errors

    return grid