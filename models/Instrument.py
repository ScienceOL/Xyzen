# Python官方库导入
from typing_extensions import Annotated
from pydantic import BaseModel, Field

class Action(BaseModel):# 动作模型
    name: Annotated[str, Field(description="动作名称")]
    description: Annotated[str, Field(description="动作描述")]
    parameters: Annotated[dict, Field(description="动作参数")]
    output: Annotated[dict, Field(description="动作输出")]
    action_id: Annotated[str, Field(description="动作ID, 用于唯一标识动作")]

class Instrument(BaseModel):# 仪器模型
    name: Annotated[str, Field(description="仪器名称")]
    description: Annotated[str, Field(description="仪器描述")]
    instrument_id: Annotated[str, Field(description="仪器ID, 用于唯一标识仪器")]
    actions: Annotated[dict[str, Action], Field(description="仪器动作")]

class InstrumentsData(BaseModel):# 仪器动作POST传参数据模型
    instruments: Annotated[dict[str, Instrument], Field(description="仪器动作POST传参数据模型")]

