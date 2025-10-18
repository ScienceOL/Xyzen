from internal import configs

LOGGING_CONFIG = {
    "version": 1,
    "disable_existing_loggers": False,
    "formatters": {
        "default": {
            "()": "uvicorn.logging.DefaultFormatter",
            "fmt": "%(levelprefix)s \033[90m%(asctime)s\033[0m \033[36m|\033[0m \033[35m%(name)s\033[0m \033[36m|\033[0m %(message)s",  # noqa: E501
            "datefmt": "%Y-%m-%d %H:%M:%S",
            "use_colors": True,
        },
        "access": {
            "()": "uvicorn.logging.AccessFormatter",
            "fmt": '%(levelprefix)s \033[90m%(asctime)s\033[0m \033[36m|\033[0m %(client_addr)s \033[36m|\033[0m "%(request_line)s" %(status_code)s',  # noqa: E501
            "datefmt": "%Y-%m-%d %H:%M:%S",
            "use_colors": True,
        },
    },
    "handlers": {
        "default": {
            "formatter": "default",
            "class": "logging.StreamHandler",
            "stream": "ext://sys.stdout",
        },
        "access": {
            "formatter": "access",
            "class": "logging.StreamHandler",
            "stream": "ext://sys.stdout",
        },
    },
    "loggers": {
        "": {
            "level": configs.Logger.Level.upper(),
            "handlers": ["default"],
        },
        "cmd.main": {
            "level": "DEBUG",
            "handlers": ["default"],
            "propagate": False,
        },
        "sqlalchemy.engine": {
            "level": "WARNING",
            "handlers": ["default"],
            "propagate": False,
        },
        "uvicorn.error": {
            "level": "WARNING",
            "handlers": ["default"],
            "propagate": False,
        },
        "uvicorn": {
            "level": "WARNING",
            "handlers": ["default"],
            "propagate": False,
        },
        "uvicorn.access": {
            "level": "WARNING",
            "handlers": ["access"],
            "propagate": False,
        },
    },
}
