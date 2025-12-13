import tomllib

def load_config(filename="config.toml") -> dict[str, dict[str, str]]:
    with open(filename, "rb") as f:
        return tomllib.load(f)

config = load_config()
