from fastapi import FastAPI
from routers import labs_router, tools_router

app = FastAPI()
app.include_router(labs_router)# 实验室路由
app.include_router(tools_router)# MCP工具路由

# normal http
@app.get("/", operation_id="index", tags=["default"])
def index():
    return {"message": "Hello World!"}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=8000)
    # uvicorn.run(app, host="0.0.0.0", port=8000)

