import logging
from fastapi import FastAPI
from servers import LabMCPServer
from routers import labs_router, tools_router

# 配置日志
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.StreamHandler()  # 输出到控制台
    ]
)

app = FastAPI()
app.include_router(labs_router)# 实验室路由
app.include_router(tools_router)# MCP工具路由

# normal http
@app.get("/", operation_id="index", tags=["default"])
def index():
    return {"message": "Hello World!"}

mcp = LabMCPServer(fastapi=app)

# 挂载到统一的MCP Router
mcp.mount()

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=8000)
    # uvicorn.run(app, host="0.0.0.0", port=8000)

