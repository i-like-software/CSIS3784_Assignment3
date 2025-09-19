 // Enable Weapons
            if (shootButton, bazookaButton, grenadeButton) {
                shootButton.disabled = false;
                bazookaButton.disabled = false;
                grenadeButton.disabled = false;
                // ensure multiple listeners are not stacked
                shootButton.removeEventListener('click', shootHandler);
                shootButton.addEventListener('click', shootHandler);
                bazookaButton.removeEventListener('click', shootHandler);
                bazookaButton.addEventListener('click', shootHandler);
                grenadeButton.removeEventListener('click', shootHandler);
                grenadeButton.addEventListener('click', shootHandler);