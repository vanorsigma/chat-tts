import torch
import torch.optim as optim
import torch.nn as nn
import random
from collections import deque

from rl import BattleshipEnv
from action_mask import QNetwork

def train_rl_agent(episodes=10_000, batch_size=64, gamma=0.99):
    device = torch.device('cuda' if torch.cuda.is_available() else 'cpu')
    env = BattleshipEnv()

    q_net = QNetwork().to(device)
    target_net = QNetwork().to(device)
    target_net.load_state_dict(q_net.state_dict())

    optimizer = optim.Adam(q_net.parameters(), lr=0.0005)
    replay_buffer = deque(maxlen=50000)

    epsilon = 1.0
    epsilon_min = 0.05
    epsilon_decay = 0.9995

    for ep in range(episodes):
        state = env.reset()
        done = False
        total_reward = 0.0

        while not done:
            valid_mask = torch.tensor((state[0] == 1.0), dtype=torch.bool, device=device)

            if random.random() < epsilon:
                valid_indices = torch.where(valid_mask.flatten())[0].cpu().numpy()
                action = random.choice(valid_indices)
            else:
                state_tensor = torch.tensor(state, dtype=torch.float32).unsqueeze(0)
                with torch.no_grad():
                    q_vals = q_net(state_tensor, valid_mask.unsqueeze(0))
                    action = q_vals.argmax(dim=1).item()

            next_state, reward, done, info = env.step(action)
            total_reward += reward

            replay_buffer.append((state, action, reward, next_state, done))
            state = next_state

            if len(replay_buffer) > batch_size:
                batch = random.sample(replay_buffer, batch_size)
                b_states, b_actions, b_rewards, b_next_states, b_dones = zip(*batch)

                b_states_t = torch.tensor(np.array(b_states), dtype=torch.float32).to(device)
                b_actions_t = torch.tensor(b_actions, dtype=torch.long).unsqueeze(1).to(device)
                b_rewards_t = torch.tensor(b_rewards, dtype=torch.float32).unsqueeze(1).to(device)
                b_next_states_t = torch.tensor(np.array(b_next_states), dtype=torch.float32).to(device)
                b_dones_t = torch.tensor(b_dones, dtype=torch.float32).unsqueeze(1).to(device)

                # Compute Current Q
                current_q = q_net(b_states_t).gather(1, b_actions_t)

                # Compute Target Q
                with torch.no_grad():
                    max_next_q = target_net(b_next_states_t).max(dim=1, keepdim=True)[0]
                    target_q = b_rewards_t + (1 - b_dones_t) * gamma * max_next_q

                loss = nn.MSELoss()(current_q, target_q)
                optimizer.zero_grad()
                loss.backward()
                optimizer.step()

        epsilon = max(epsilon_min, epsilon * epsilon_decay)

        if ep % 200 == 0:
            target_net.load_state_dict(q_net.state_dict())
            print(f"Episode {ep} | Reward {total_reward:.2f} | Epsilon: {epsilon:.3f} | Last Result: {info['result']}")

    return q_net
