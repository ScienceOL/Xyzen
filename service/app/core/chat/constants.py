# Default topic title used when creating new topics.
# Keep in sync with the frontend i18n key "app.chatConfig.defaultTitle".
DEFAULT_TOPIC_TITLE = "New Chat"

# All translated variants of the default title.
# The auto-rename logic checks against these values to decide whether to
# generate a title from the first user message.
DEFAULT_TOPIC_TITLES = frozenset({DEFAULT_TOPIC_TITLE, "新的聊天", "新しいチャット"})
