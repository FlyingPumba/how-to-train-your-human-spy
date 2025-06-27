class HumanSpyGame {
    constructor() {
        this.apiKey = '';
        this.playerName = '';
        this.botCount = 4;
        this.currentTurn = 0;
        this.score = 0;
        this.players = [];
        this.currentTopic = '';
        this.turnOrder = [];
        this.currentSpeakerIndex = 0;
        this.gamePhase = 'setup'; // setup, discussion, voting, gameOver
        this.votes = {};
        this.gameRunning = false;
        
        this.initializeEventListeners();
    }

    initializeEventListeners() {
        document.getElementById('start-game').addEventListener('click', () => this.startGame());
        document.getElementById('send-message').addEventListener('click', () => this.sendPlayerMessage());
        document.getElementById('message-input').addEventListener('keypress', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                this.sendPlayerMessage();
            }
        });
        document.getElementById('submit-vote').addEventListener('click', () => this.submitVote());
        document.getElementById('play-again').addEventListener('click', () => this.resetGame());
    }

    async startGame() {
        this.playerName = document.getElementById('player-name').value.trim();
        this.botCount = parseInt(document.getElementById('bot-count').value);
        this.apiKey = document.getElementById('api-key').value.trim();

        if (!this.playerName || !this.apiKey) {
            alert('Please enter your name and API key');
            return;
        }

        this.gameRunning = true;
        this.showScreen('game-screen');
        await this.initializeGame();
    }

    async initializeGame() {
        this.players = [{ name: this.playerName, type: 'human' }];
        
        // Add AI bots with different models
        const models = [
            'anthropic/claude-3-haiku',
            'openai/gpt-3.5-turbo',
            'openai/gpt-4o-mini',
            'google/gemini-flash-1.5',
            'meta-llama/llama-3.1-8b-instruct',
            'microsoft/wizardlm-2-8x22b',
            'cohere/command-r-plus'
        ];

        for (let i = 0; i < this.botCount; i++) {
            const model = models[i % models.length];
            this.players.push({
                name: `Bot${i + 1}`,
                type: 'bot',
                model: model
            });
        }

        await this.generateTopic();
        this.startTurn();
    }

    async generateTopic() {
        try {
            const response = await this.callOpenRouter(
                'anthropic/claude-3-haiku',
                'You are a game master. Generate a single, engaging discussion topic for a social deduction game. The topic should be something that allows for diverse opinions and creative responses. Return only the topic, nothing else. Examples: "What would you do if you could time travel?", "Describe your ideal vacation", "What superpower would you choose and why?"'
            );
            
            this.currentTopic = response.trim();
            document.getElementById('current-topic').textContent = this.currentTopic;
        } catch (error) {
            console.error('Error generating topic:', error);
            this.currentTopic = "What would you do if you could time travel?";
            document.getElementById('current-topic').textContent = this.currentTopic;
        }
    }

    startTurn() {
        this.currentTurn++;
        this.updateGameInfo();
        this.shuffleTurnOrder();
        this.currentSpeakerIndex = 0;
        this.gamePhase = 'discussion';
        this.nextSpeaker();
    }

    shuffleTurnOrder() {
        this.turnOrder = [...this.players];
        for (let i = this.turnOrder.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [this.turnOrder[i], this.turnOrder[j]] = [this.turnOrder[j], this.turnOrder[i]];
        }
    }

    async nextSpeaker() {
        if (this.currentSpeakerIndex >= this.turnOrder.length) {
            this.startVoting();
            return;
        }

        const currentPlayer = this.turnOrder[this.currentSpeakerIndex];
        document.getElementById('speaker-name').textContent = currentPlayer.name;
        
        if (currentPlayer.type === 'human') {
            this.showPlayerInput();
        } else {
            this.showTypingIndicator();
            await this.generateBotResponse(currentPlayer);
            this.hideTypingIndicator();
            this.currentSpeakerIndex++;
            setTimeout(() => this.nextSpeaker(), 1000);
        }
    }

    showPlayerInput() {
        document.getElementById('player-input').classList.remove('hidden');
        document.getElementById('message-input').focus();
    }

    hidePlayerInput() {
        document.getElementById('player-input').classList.add('hidden');
        document.getElementById('message-input').value = '';
    }

    showTypingIndicator() {
        document.getElementById('typing-indicator').classList.remove('hidden');
    }

    hideTypingIndicator() {
        document.getElementById('typing-indicator').classList.add('hidden');
    }

    sendPlayerMessage() {
        const message = document.getElementById('message-input').value.trim();
        if (!message) return;

        this.addMessage(this.playerName, message, 'human');
        this.hidePlayerInput();
        this.currentSpeakerIndex++;
        setTimeout(() => this.nextSpeaker(), 500);
    }

    async generateBotResponse(bot) {
        try {
            const chatHistory = this.getChatHistory();
            const prompt = `You are playing a social deduction game where you must blend in with humans. The topic is: "${this.currentTopic}"

Chat history:
${chatHistory}

Respond naturally to the topic as if you were a human. Keep your response conversational, 1-2 sentences, and avoid being too robotic or perfect. Show personality and perhaps a slight quirk or opinion. Don't mention that you're an AI.`;

            const response = await this.callOpenRouter(bot.model, prompt);
            this.addMessage(bot.name, response.trim(), 'bot');
        } catch (error) {
            console.error('Error generating bot response:', error);
            const fallbackResponses = [
                "That's an interesting perspective on this topic.",
                "I have mixed feelings about that, to be honest.",
                "Oh wow, I never thought about it that way before!",
                "That reminds me of something that happened to me once."
            ];
            const response = fallbackResponses[Math.floor(Math.random() * fallbackResponses.length)];
            this.addMessage(bot.name, response, 'bot');
        }
    }

    getChatHistory() {
        const messages = document.querySelectorAll('.message');
        return Array.from(messages).map(msg => {
            const name = msg.querySelector('.message-header').textContent.replace(':', '');
            const text = msg.querySelector('.message-text').textContent;
            return `${name}: ${text}`;
        }).join('\n');
    }

    addMessage(name, text, type) {
        const messagesContainer = document.getElementById('chat-messages');
        const messageDiv = document.createElement('div');
        messageDiv.className = `message ${type}`;
        messageDiv.innerHTML = `
            <div class="message-header">${name}:</div>
            <div class="message-text">${text}</div>
        `;
        messagesContainer.appendChild(messageDiv);
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }

    startVoting() {
        this.gamePhase = 'voting';
        document.getElementById('voting-section').classList.remove('hidden');
        
        const votingOptions = document.getElementById('voting-options');
        votingOptions.innerHTML = '';
        
        this.players.forEach(player => {
            const option = document.createElement('div');
            option.className = 'vote-option';
            option.textContent = player.name;
            option.addEventListener('click', () => this.selectVote(player.name));
            votingOptions.appendChild(option);
        });
    }

    selectVote(playerName) {
        document.querySelectorAll('.vote-option').forEach(option => {
            option.classList.remove('selected');
        });
        
        event.target.classList.add('selected');
        this.selectedVote = playerName;
        document.getElementById('submit-vote').disabled = false;
    }

    async submitVote() {
        if (!this.selectedVote) return;
        
        this.votes[this.playerName] = this.selectedVote;
        
        // Generate bot votes
        for (const player of this.players) {
            if (player.type === 'bot') {
                try {
                    const chatHistory = this.getChatHistory();
                    const playerList = this.players.map(p => p.name).join(', ');
                    
                    const prompt = `You are playing a social deduction game. Based on the conversation, vote for who you think is the human player trying to blend in with AI bots.

Chat history:
${chatHistory}

Players: ${playerList}

Who seems most like a human? Consider factors like:
- Natural conversation flow
- Emotional responses
- Personal anecdotes
- Slight imperfections or quirks
- Less formal language

Respond with only the player's name.`;

                    const response = await this.callOpenRouter(player.model, prompt);
                    const votedPlayer = response.trim();
                    
                    // Validate the vote
                    if (this.players.some(p => p.name === votedPlayer)) {
                        this.votes[player.name] = votedPlayer;
                    } else {
                        // Random vote if response is invalid
                        const randomPlayer = this.players[Math.floor(Math.random() * this.players.length)];
                        this.votes[player.name] = randomPlayer.name;
                    }
                } catch (error) {
                    console.error('Error generating bot vote:', error);
                    // Random vote on error
                    const randomPlayer = this.players[Math.floor(Math.random() * this.players.length)];
                    this.votes[player.name] = randomPlayer.name;
                }
            }
        }
        
        this.processVotes();
    }

    processVotes() {
        const voteCounts = {};
        Object.values(this.votes).forEach(vote => {
            voteCounts[vote] = (voteCounts[vote] || 0) + 1;
        });
        
        const maxVotes = Math.max(...Object.values(voteCounts));
        const winners = Object.keys(voteCounts).filter(name => voteCounts[name] === maxVotes);
        
        // Check if there's a majority and if they correctly identified the human
        const majorityThreshold = Math.ceil(this.players.length / 2);
        
        if (maxVotes >= majorityThreshold && winners.includes(this.playerName)) {
            this.endGame(false, `The bots correctly identified you as the human! You survived ${this.currentTurn} turns.`);
        } else if (maxVotes >= majorityThreshold) {
            // Bots voted for wrong player, human survives this round
            this.score = this.currentTurn;
            this.clearChat();
            document.getElementById('voting-section').classList.add('hidden');
            this.votes = {};
            setTimeout(() => this.startTurn(), 2000);
        } else {
            // No majority, continue game
            this.score = this.currentTurn;
            this.clearChat();
            document.getElementById('voting-section').classList.add('hidden');
            this.votes = {};
            setTimeout(() => this.startTurn(), 2000);
        }
    }

    clearChat() {
        document.getElementById('chat-messages').innerHTML = '';
    }

    endGame(won, message) {
        this.gameRunning = false;
        this.showScreen('game-over-screen');
        document.getElementById('final-score').textContent = `Final Score: ${this.score} turns`;
        document.getElementById('game-result').textContent = message;
    }

    async callOpenRouter(model, prompt) {
        const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${this.apiKey}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                model: model,
                messages: [
                    { role: 'user', content: prompt }
                ],
                max_tokens: 150,
                temperature: 0.7
            })
        });

        if (!response.ok) {
            throw new Error(`API call failed: ${response.status}`);
        }

        const data = await response.json();
        return data.choices[0].message.content;
    }

    updateGameInfo() {
        document.getElementById('turn-counter').textContent = `Turn: ${this.currentTurn}`;
        document.getElementById('score').textContent = `Score: ${this.score}`;
    }

    showScreen(screenId) {
        document.querySelectorAll('.screen').forEach(screen => {
            screen.classList.remove('active');
        });
        document.getElementById(screenId).classList.add('active');
    }

    resetGame() {
        this.currentTurn = 0;
        this.score = 0;
        this.players = [];
        this.votes = {};
        this.gameRunning = false;
        this.gamePhase = 'setup';
        this.clearChat();
        document.getElementById('voting-section').classList.add('hidden');
        this.hidePlayerInput();
        this.showScreen('setup-screen');
    }
}

// Initialize the game when the page loads
window.addEventListener('DOMContentLoaded', () => {
    new HumanSpyGame();
});