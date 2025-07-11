from fastapi import FastAPI
from fastapi_mcp import FastApiMCP
from routers import labs_router

app = FastAPI()
app.include_router(labs_router)

# normal http
@app.get("/", operation_id="index", tags=["default"])
def index():
    return {"message": "Hello World!"}


# tools
@app.post("/tools/BMI_calculator", operation_id="BMI_calculator", tags=["tools"])
def BMI_calculator(weight: float, height: float) -> float:
    """
    Calculate BMI
    """
    return round(weight / (height**2), 2)


@app.post("/tools/greetings", operation_id="greetings", tags=["tools"])
def greetings(name: str) -> str:
    """
    Greet the user by name
    """
    return f"Hello {name}!"


@app.post("/tools/multiply", operation_id="multiply", tags=["tools"])
def multiply(a: float, b: float) -> float:
    """
    Multiply two numbers
    """
    return a * b


# resources
@app.get("/resources/config/{theme}", operation_id="config", tags=["resources"])
def get_config(theme: str) -> dict:
    """Provides the application configuration."""
    return {"theme": theme, "version": "1.0"}


@app.get("/resources/{user_id}/profile", operation_id="profile", tags=["resources"])
def get_profile(user_id: int) -> dict:
    """
    Get user profile
    """
    return {"user_id": user_id, "status": "active", "name": f"user_{user_id}"}


# prompts
@app.post("/prompts/llm", operation_id="llm", tags=["prompts"])
def analyze_data(data_points: list[float]) -> str:
    """Creates a prompt asking for analysis of numerical data."""
    formatted_data = ", ".join(str(point) for point in data_points)
    return f"Please analyze these data points: {formatted_data}"


mcp = FastApiMCP(fastapi=app, include_tags=["tools", "resources"])

mcp.mount()

if __name__ == "__main__":
    import uvicorn
    # uvicorn.run(app, host="127.0.0.1", port=8000)
    uvicorn.run(app, host="0.0.0.0", port=8000)

