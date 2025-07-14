# Python官方库导入
from typing_extensions import Annotated, Dict, List
from pydantic import BaseModel, Field

class Action(BaseModel):# 动作模型
    name: Annotated[str, Field(description="动作名称")]
    description: Annotated[str, Field(description="动作描述")]
    parameters: Annotated[Dict, Field(description="动作参数")]
    output: Annotated[Dict, Field(description="动作输出")]
    action_id: Annotated[str, Field(description="动作ID, 用于唯一标识动作")]

class Instrument(BaseModel):# 仪器模型
    name: Annotated[str, Field(description="仪器名称")]
    description: Annotated[str, Field(description="仪器描述")]
    instrument_id: Annotated[str, Field(description="仪器ID, 用于唯一标识仪器")]
    actions: Annotated[List[Action], Field(description="仪器动作")]
    
    def __hash__(self) -> int:# 基于instrument_id比较两个Instrument
        return hash(self.instrument_id)
    
    def __eq__(self, other) -> bool:# 基于instrument_id比较两个Instrument
        if isinstance(other, Instrument):
            return self.instrument_id == other.instrument_id
        return False

class InstrumentsData(BaseModel):# 仪器动作POST传参数据模型
    instruments: Annotated[List[Instrument], Field(description="仪器动作POST传参数据模型")]

