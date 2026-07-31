import os
import json
from typing import List, Dict, Any

DATA_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "data"))

class JSONStore:
    def __init__(self, filename: str, default_data: List[Dict[str, Any]] = None):
        os.makedirs(DATA_DIR, exist_ok=True)
        self.filepath = os.path.join(DATA_DIR, filename)
        self.data: List[Dict[str, Any]] = []
        self.default_data = default_data or []
        self.load()

    def load(self):
        if os.path.exists(self.filepath):
            try:
                with open(self.filepath, "r", encoding="utf-8") as f:
                    self.data = json.load(f)
            except Exception:
                self.data = list(self.default_data)
                self.save()
        else:
            self.data = list(self.default_data)
            self.save()

    def save(self):
        try:
            with open(self.filepath, "w", encoding="utf-8") as f:
                json.dump(self.data, f, ensure_ascii=False, indent=2)
        except Exception:
            pass

    def get_all(self) -> List[Dict[str, Any]]:
        return self.data

    def get_by_id(self, item_id: int) -> Dict[str, Any] | None:
        for item in self.data:
            if item.get("id") == item_id:
                return item
        return None

    def add(self, item: Dict[str, Any]) -> Dict[str, Any]:
        if "id" not in item or not item["id"]:
            max_id = max([x.get("id", 0) for x in self.data], default=0)
            item["id"] = max_id + 1
        self.data.append(item)
        self.save()
        return item

    def update(self, item_id: int, updates: Dict[str, Any]) -> Dict[str, Any] | None:
        for item in self.data:
            if item.get("id") == item_id:
                item.update(updates)
                self.save()
                return item
        return None

    def delete(self, item_id: int) -> bool:
        initial_len = len(self.data)
        self.data = [x for x in self.data if x.get("id") != item_id]
        if len(self.data) < initial_len:
            self.save()
            return True
        return False
