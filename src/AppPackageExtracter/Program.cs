namespace AppPackageExtracter
{
    class Program
    {
        public static void Main(string[] args)
        {
            // args = new string[] {
            //     "-packagesPath:\"C:\\projects\\testBCFruitIntegration\\.alpackages\\The PTE team, Cronus_BC Fruits 2_1.0.0.1.app|C:\\projects\\testBCFruitIntegration\\.alpackages\\Microsoft_System_20.0.42653.42764.app|C:\\projects\\testBCFruitIntegration\\.alpackages\\Microsoft_Base Application_20.3.42673.44371.app\"",
            //     "-cacheFolder:\"C:\\Users\\soudutta\\AppData\\Local\\Temp\\bc2dataverse\"",
            //     "-bcDllFolderPath:\"C:\\Users\\soudutta\\.vscode\\extensions\\ms-dynamics-smb.al-9.4.663067\\bin\"",
            //     "-relativeFilePath:\"/SymbolReference.json\""
            // };
            var commandLineArgs = CommandLineArgs.Parse(args);
            new Runner(commandLineArgs).Start();
        }
    }
}