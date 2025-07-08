from pydantic import Annotated, BaseModel, Field
from typing import Literal


class Lab(BaseModel):
    # 实验室基础信息
    name: Annotated[str | None, Field(description="实验室的名称")]
    description: Annotated[str | None, Field(description="实验室的描述")]
    # 实验室管理参数信息
    lid: Annotated[int | None, Field(description="实验室的Lab ID")]
    type: Annotated[Literal["Public", "Private"], Field(description="实验室的类型")]
    discipline: Annotated[
        Literal["Chemistry", "Biology"], Field(description="实验室的学科类型")
    ]
