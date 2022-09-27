## Overview

Welcome to the bc2dataverse extension page!

This tool helps you achieve quicker integration of your Dynamics 365 Business Central with [Dataverse](https://powerplatform.microsoft.com/en-us/dataverse/), that powers your Power Apps or Dynamics 365 Customer Engagement apps. Using inputs from you, it generates the [AL code](https://learn.microsoft.com/en-us/dynamics365/business-central/dev-itpro/developer/devenv-programming-in-al) that can then be added to, or published as, an [AL extension](https://learn.microsoft.com/en-us/dynamics365/business-central/dev-itpro/developer/devenv-dev-overview). The generated code conforms to the guidelines as specified at [Customizing an Integration with Microsoft Dataverse](https://learn.microsoft.com/en-us/dynamics365/business-central/dev-itpro/administration/administration-custom-cds-integration).

> **This tool is a prototype and it is the sole responsibility of the user to ensure that the code generated using this tool is correct. The makers of the tool are not responsible for the consequences of executing such code in a production environment. You are welcome to visit [the Support page](./SUPPORT.md). In case you wish to engage directly with us, please write to bc2dataverse@microsoft.com. As we are a small team, please expect delays in getting back to you.**

## Features

This extension includes the following VS Code commands that become available on the Visual Studio Code [command palette](https://code.visualstudio.com/docs/getstarted/userinterface#_command-palette),
- `bc2dataverse: Generate proxy table` generates the proxy table inside Business Central that mirrors the data on the Dataverse.
- `bc2dataverse: Generate list page` generates a list page for the proxy table created above so users can view/ synchronize data for individual entities.
- `bc2dataverse: Map to existing table` generates the AL codeunit that holds the code to map fields and tables between the Business Central data and the Dataverse data.

## Start using this tool

### Prerequisites

Please be mindful of these before you run this tool,
- In order to use this extension, make sure that you are in a valid AL project by following the instructions at [Get Started with AL](https://learn.microsoft.com/da-dk/dynamics365/business-central/dev-itpro/developer/devenv-get-started).
- Ensure that you have the [AL Language extension](https://marketplace.visualstudio.com/items?itemName=ms-dynamics-smb.al) installed in Visual Studio Code.
- Always make sure that you have compiled your AL project before invoking any of the VS Code commands.

### Installation
Please follow the following steps to install this VS Code extension,
1. Download the file [bc2dataverse-1.0.0.vsix](/bc2dataverse-1.0.0.vsix).
2. In the AL workspace which you are in, follow the instructions at [Install from a VSIX](https://code.visualstudio.com/docs/editor/extension-marketplace#_install-from-a-vsix), and select the file you downloaded in the previous step.
3. In the Command Palette, start typing `bc2dataverse` to see the available commands. Select any command to invoke it.

## Contributing

This project welcomes contributions and suggestions.  Most contributions require you to agree to a
Contributor License Agreement (CLA) declaring that you have the right to, and actually do, grant us
the rights to use your contribution. For details, visit https://cla.opensource.microsoft.com.

When you submit a pull request, a CLA bot will automatically determine whether you need to provide
a CLA and decorate the PR appropriately (e.g., status check, comment). Simply follow the instructions
provided by the bot. You will only need to do this once across all repos using our CLA.

This project has adopted the [Microsoft Open Source Code of Conduct](https://opensource.microsoft.com/codeofconduct/).
For more information see the [Code of Conduct FAQ](https://opensource.microsoft.com/codeofconduct/faq/) or
contact [opencode@microsoft.com](mailto:opencode@microsoft.com) with any additional questions or comments.

## Trademarks

This project may contain trademarks or logos for projects, products, or services. Authorized use of Microsoft
trademarks or logos is subject to and must follow
[Microsoft's Trademark & Brand Guidelines](https://www.microsoft.com/en-us/legal/intellectualproperty/trademarks/usage/general).
Use of Microsoft trademarks or logos in modified versions of this project must not cause confusion or imply Microsoft sponsorship.
Any use of third-party trademarks or logos are subject to those third-party's policies.

**Enjoy!**
