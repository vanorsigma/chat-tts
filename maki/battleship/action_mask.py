import torch
import torch.nn as nn

class QNetwork(nn.Module):
    def __init__(self):
        super().__init__()

        self.feature_extractor = nn.Sequential(
            nn.Conv2d(3, 32, kernel_size=3, padding=1),
            nn.ReLU(),
            nn.Conv2d(32, 64, kernel_size=3, padding=1),
            nn.ReLU(),
            nn.Conv2d(64, 32, kernel_size=3, padding=1),
            nn.ReLU(),
            nn.Flatten() # 10x10x32
        )

        self.fc = nn.Sequential(
            nn.Linear(32 * 10 * 10, 256),
            nn.ReLU(),
            nn.Linear(256, 100)
        )

    def forward(self, state, valid_mask=None):
        features = self.feature_extractor(state)
        q_values = self.fc(features)
        if valid_mask is not None:
            valid_mask = valid_mask.reshape(valid_mask.shape[0], -1)
            q_values = torch.where(valid_mask, q_values, torch.tensor(-1e9, device=q_values.device))
        return q_values
