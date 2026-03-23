# personalized-reading-dutch

## Project Structure

personalized-reading-dutch/
│
├── frontend/ # React app
├── backend/ # FastAPI server
├── data/ # vocabulary and other datasets
├── README.md
└──.gitignore


## How to run

### Prerequisites

- Node.js and npm (for frontend)
- Python 3.10+ (for backend)
- Git (to clone the repo)

### Backend Setup
1. Navigate to the backend folder:
cd backend
2. Install dependencies:
pip install -r requirements.txt
3. Run the backend server:
uvicorn main:app --reload
4. Open your browser at http://127.0.0.1:8000

### Frontend Setup
1. Navigate to the frontend folder:
cd frontend
2. Install dependencies (if not already installed):
npm install
3. Start the React development server:
npm start
4. Open your browser at http://localhost:3000