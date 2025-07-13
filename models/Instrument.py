# Python官方库导入
from pydantic import BaseModel, Field
from typing_extensions import Annotated

# 动作模型
class Action(BaseModel):
    name: Annotated[str, Field(description="动作名称")]
    description: Annotated[str, Field(description="动作描述")]
    parameters: Annotated[dict, Field(description="动作参数")]

# 仪器模型
class Instrument(BaseModel):
    name: Annotated[str, Field(description="仪器名称")]
    description: Annotated[str, Field(description="仪器描述")]
    actions: Annotated[dict[str, Action], Field(description="仪器动作")]

# 嵌套字典结构的仪器数据模型
class InstrumentsData(BaseModel):
    Instruments: Annotated[dict[str, Instrument], Field(description="仪器字典")]