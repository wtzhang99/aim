import inspect
import logging

logging.basicConfig(level=logging.INFO)


import torch
import datasets
from transformers import AutoModelForSequenceClassification, AutoTokenizer
from torch.utils.data import DataLoader
from aim import Run
from aim.sdk.control.callback import AimInteractiveTrainCallback


# # Initialize a new Run
aim_run = Run(repo="/Users/kstarxin/Documents/test_aim", experiment='bert_training', interactive=True)
interactive_callback = AimInteractiveTrainCallback(aim_run, train_file_path=__file__)

# moving model to gpu if available
device = torch.device('cuda:0' if torch.cuda.is_available() else 'cpu')

tokenizer = AutoTokenizer.from_pretrained("gaunernst/bert-small-uncased")

model = AutoModelForSequenceClassification.from_pretrained("gaunernst/bert-small-uncased", num_labels=2)
model.to(device)

raw_datasets = datasets.load_dataset("imdb")

# Tokenize dataset
def tokenize_function(examples):
    return tokenizer(examples["text"], padding="max_length", truncation=True, max_length=128)

tokenized_datasets = raw_datasets.map(tokenize_function, batched=True)
tokenized_datasets = tokenized_datasets.remove_columns(["text"])
tokenized_datasets = tokenized_datasets.rename_column("label", "labels")
tokenized_datasets.set_format("torch")

# Use small subset for quick training
small_train_dataset = tokenized_datasets["train"].shuffle(seed=42).select(range(1000))

train_dataloader = DataLoader(small_train_dataset, batch_size=2, shuffle=True)

# Training setup
optimizer = torch.optim.AdamW(model.parameters(), lr=5e-5)
num_epochs = 2000

# Training loop
model.train()
for epoch in range(num_epochs):
    for step, batch in enumerate(train_dataloader):
        batch = {k: v.to(device) for k, v in batch.items()}
        
        outputs = model(**batch)
        loss = outputs.loss
        loss.backward()
        
        optimizer.step()
        optimizer.zero_grad()
        interactive_callback.on_step_end()
        
        # Track loss with Aim
        aim_run.track(loss.item(), name='loss', step=epoch * len(train_dataloader) + step)
        
        if step % 5 == 0:
            print(f"Epoch {epoch}, Step {step}, Loss: {loss.item():.4f}")
        loss = interactive_callback.intervene_loss(loss.item(), context={'epoch': epoch, 'step': step, 'batch': batch, "model": model})

print("Training completed!")
aim_run.close()

