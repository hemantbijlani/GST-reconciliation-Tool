import React, { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Link } from 'react-router-dom';
import axios from 'axios';
import './App.css';

// Import Shadcn components
import { Button } from './components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './components/ui/table';
import { Badge } from './components/ui/badge';
import { Alert, AlertDescription } from './components/ui/alert';
import { Progress } from './components/ui/progress';
import { Input } from './components/ui/input';
import { Label } from './components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './components/ui/select';
import { Separator } from './components/ui/separator';
import { useToast } from './hooks/use-toast';
import { Toaster } from './components/ui/toaster';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from './components/ui/tooltip';

// Import icons
import { 
  Upload, 
  FileText, 
  BarChart3, 
  Download, 
  Trash2, 
  RefreshCw, 
  CheckCircle, 
  XCircle, 
  AlertTriangle, 
  HelpCircle, 
  FileSpreadsheet,
  Calculator,
  Users,
  TrendingUp,
  Shield,
  Info,
  Lightbulb,
  Star,
  Award
} from 'lucide-react';

// Import charts
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as ChartTooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';

// Dropzone for file upload
import { useDropzone } from 'react-dropzone';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

// Enhanced File Upload Component with better UX
const FileUploadZone = ({ onFileUpload, recordType, isUploading }) => {
  const { toast } = useToast();
  
  const onDrop = async (acceptedFiles) => {
    const file = acceptedFiles[0];
    if (!file) return;
    
    if (!file.name.match(/\.(xlsx|xls|csv)$/)) {
      toast({
        title: "Invalid file type",
        description: "Please upload Excel (.xlsx, .xls) or CSV (.csv) files only.",
        variant: "destructive",
      });
      return;
    }
    
    // Check file size (10MB limit)
    if (file.size > 10 * 1024 * 1024) {
      toast({
        title: "File too large",
        description: "File size must be less than 10MB.",
        variant: "destructive",
      });
      return;
    }
    
    await onFileUpload(file, recordType);
  };

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    multiple: false,
    accept: {
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
      'application/vnd.ms-excel': ['.xls'],
      'text/csv': ['.csv']
    }
  });

  return (
    <div
      {...getRootProps()}
      className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all duration-300 upload-zone-enhanced
        ${isDragActive ? 'border-blue-500 bg-blue-50 scale-102' : 'border-gray-300 hover:border-blue-400 hover:bg-blue-50'}
        ${isUploading ? 'opacity-50 cursor-not-allowed' : ''}
      `}
    >
      <input {...getInputProps()} disabled={isUploading} />
      <div className="flex flex-col items-center">
        <Upload className={`mx-auto h-16 w-16 mb-4 transition-colors ${isDragActive ? 'text-blue-500' : 'text-gray-400'}`} />
        {isUploading ? (
          <div className="space-y-2">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mx-auto"></div>
            <p className="text-blue-600 font-medium">Uploading and processing...</p>
          </div>
        ) : isDragActive ? (
          <div>
            <p className="text-blue-600 font-medium text-lg mb-2">Drop the file here!</p>
            <p className="text-blue-500 text-sm">Release to upload your {recordType} data</p>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-gray-700 font-medium text-lg mb-2">
              Upload {recordType} Data
            </p>
            <p className="text-gray-600">
              Drag & drop your {recordType === '2B' ? 'GSTR-2B' : 'Books/Accounting'} file here, or click to browse
            </p>
            <div className="flex items-center justify-center space-x-4 text-sm text-gray-500 mt-4">
              <div className="flex items-center space-x-1">
                <FileSpreadsheet className="h-4 w-4" />
                <span>Excel (.xlsx, .xls)</span>
              </div>
              <div className="flex items-center space-x-1">
                <FileText className="h-4 w-4" />
                <span>CSV (.csv)</span>
              </div>
            </div>
            <p className="text-xs text-gray-400 mt-2">Maximum file size: 10MB</p>
          </div>
        )}
      </div>
    </div>
  );
};

// Enhanced Manual Entry Form with better validation and UX
const ManualEntryForm = ({ recordType, onSubmit }) => {
  const [formData, setFormData] = useState({
    gstin: '',
    invoice_number: '',
    invoice_date: '',
    invoice_amount: '',
    cgst: '',
    sgst: '',
    igst: '',
    vendor_name: ''
  });
  
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errors, setErrors] = useState({});

  const validateForm = () => {
    const newErrors = {};
    
    // GSTIN validation
    if (!formData.gstin || formData.gstin.length !== 15) {
      newErrors.gstin = 'GSTIN must be exactly 15 characters';
    }
    
    // Invoice number validation
    if (!formData.invoice_number.trim()) {
      newErrors.invoice_number = 'Invoice number is required';
    }
    
    // Date validation
    if (!formData.invoice_date) {
      newErrors.invoice_date = 'Invoice date is required';
    }
    
    // Amount validation
    const amount = parseFloat(formData.invoice_amount);
    if (!formData.invoice_amount || amount <= 0) {
      newErrors.invoice_amount = 'Invoice amount must be greater than 0';
    }
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!validateForm()) {
      return;
    }
    
    setIsSubmitting(true);
    
    try {
      const success = await onSubmit({
        ...formData,
        gstin: formData.gstin.toUpperCase(),
        invoice_amount: parseFloat(formData.invoice_amount) || 0,
        cgst: parseFloat(formData.cgst) || 0,
        sgst: parseFloat(formData.sgst) || 0,
        igst: parseFloat(formData.igst) || 0,
      });
      
      // Only reset form if submission was successful
      if (success) {
        setFormData({
          gstin: '',
          invoice_number: '',
          invoice_date: '',
          invoice_amount: '',
          cgst: '',
          sgst: '',
          igst: '',
          vendor_name: ''
        });
        setErrors({});
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleInputChange = (field, value) => {
    setFormData({ ...formData, [field]: value });
    // Clear error when user starts typing
    if (errors[field]) {
      setErrors({ ...errors, [field]: null });
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6 form-enhanced">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="space-y-2">
          <div className="flex items-center space-x-2">
            <Label htmlFor="gstin">GSTIN *</Label>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger>
                  <HelpCircle className="h-4 w-4 text-gray-400" />
                </TooltipTrigger>
                <TooltipContent>
                  <p>15-digit GST Identification Number</p>
                  <p>Format: 22AAAAA0000A1Z5</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
          <Input
            id="gstin"
            value={formData.gstin}
            onChange={(e) => handleInputChange('gstin', e.target.value.toUpperCase())}
            placeholder="Enter 15-digit GSTIN"
            className={`input-field ${errors.gstin ? 'border-red-500' : ''}`}
            maxLength={15}
            required
          />
          {errors.gstin && <p className="text-sm text-red-500">{errors.gstin}</p>}
        </div>
        
        <div className="space-y-2">
          <Label htmlFor="invoice_number">Invoice Number *</Label>
          <Input
            id="invoice_number"
            value={formData.invoice_number}
            onChange={(e) => handleInputChange('invoice_number', e.target.value)}
            placeholder="Enter invoice number"
            className={`input-field ${errors.invoice_number ? 'border-red-500' : ''}`}
            required
          />
          {errors.invoice_number && <p className="text-sm text-red-500">{errors.invoice_number}</p>}
        </div>
        
        <div className="space-y-2">
          <Label htmlFor="invoice_date">Invoice Date *</Label>
          <Input
            id="invoice_date"
            type="date"
            value={formData.invoice_date}
            onChange={(e) => handleInputChange('invoice_date', e.target.value)}
            className={`input-field ${errors.invoice_date ? 'border-red-500' : ''}`}
            required
          />
          {errors.invoice_date && <p className="text-sm text-red-500">{errors.invoice_date}</p>}
        </div>
        
        <div className="space-y-2">
          <div className="flex items-center space-x-2">
            <Label htmlFor="invoice_amount">Invoice Amount *</Label>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger>
                  <HelpCircle className="h-4 w-4 text-gray-400" />
                </TooltipTrigger>
                <TooltipContent>
                  <p>Total invoice amount including taxes</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
          <Input
            id="invoice_amount"
            type="number"
            step="0.01"
            min="0"
            value={formData.invoice_amount}
            onChange={(e) => handleInputChange('invoice_amount', e.target.value)}
            placeholder="Enter amount"
            className={`input-field ${errors.invoice_amount ? 'border-red-500' : ''}`}
            required
          />
          {errors.invoice_amount && <p className="text-sm text-red-500">{errors.invoice_amount}</p>}
        </div>
        
        <div className="space-y-2">
          <Label htmlFor="cgst">CGST Amount</Label>
          <Input
            id="cgst"
            type="number"
            step="0.01"
            min="0"
            value={formData.cgst}
            onChange={(e) => handleInputChange('cgst', e.target.value)}
            placeholder="Enter CGST amount"
            className="input-field"
          />
        </div>
        
        <div className="space-y-2">
          <Label htmlFor="sgst">SGST Amount</Label>
          <Input
            id="sgst"
            type="number"
            step="0.01"
            min="0"
            value={formData.sgst}
            onChange={(e) => handleInputChange('sgst', e.target.value)}
            placeholder="Enter SGST amount"
            className="input-field"
          />
        </div>
        
        <div className="space-y-2">
          <Label htmlFor="igst">IGST Amount</Label>
          <Input
            id="igst"
            type="number"
            step="0.01"
            min="0"
            value={formData.igst}
            onChange={(e) => handleInputChange('igst', e.target.value)}
            placeholder="Enter IGST amount"
            className="input-field"
          />
        </div>
        
        {recordType === 'BOOKS' && (
          <div className="space-y-2">
            <Label htmlFor="vendor_name">Vendor Name</Label>
            <Input
              id="vendor_name"
              value={formData.vendor_name}
              onChange={(e) => handleInputChange('vendor_name', e.target.value)}
              placeholder="Enter vendor name"
              className="input-field"
            />
          </div>
        )}
      </div>
      
      <div className="pt-4">
        <Button 
          type="submit" 
          className="w-full bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 button-hover-scale"
          disabled={isSubmitting}
        >
          {isSubmitting ? (
            <div className="flex items-center space-x-2">
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
              <span>Adding Record...</span>
            </div>
          ) : (
            <>
              <Calculator className="h-4 w-4 mr-2" />
              Add {recordType} Record
            </>
          )}
        </Button>
      </div>
    </form>
  );
};

// Enhanced Data Display Component
const DataTable = ({ data, title, recordType }) => {
  if (!data || data.length === 0) {
    return (
      <Card className="card-hover">
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <FileText className="h-5 w-5" />
            <span>{title}</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-12">
            <FileText className="h-16 w-16 text-gray-300 mx-auto mb-4" />
            <p className="text-gray-500 text-lg mb-2">No data available</p>
            <p className="text-gray-400 text-sm">Upload files or add records manually to get started</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="card-hover data-table">
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <FileText className="h-5 w-5" />
            <span>{title}</span>
          </div>
          <Badge variant="secondary" className="status-badge">
            {data.length.toLocaleString()} records
          </Badge>
        </CardTitle>
        <CardDescription>
          {recordType === 'BOOKS' ? 'Accounting system records' : 'GSTR-2B government records'}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="font-semibold">GSTIN</TableHead>
                <TableHead className="font-semibold">Invoice Number</TableHead>
                <TableHead className="font-semibold">Date</TableHead>
                <TableHead className="font-semibold text-right">Amount</TableHead>
                <TableHead className="font-semibold text-right">CGST</TableHead>
                <TableHead className="font-semibold text-right">SGST</TableHead>
                <TableHead className="font-semibold text-right">IGST</TableHead>
                <TableHead className="font-semibold text-right">Total Tax</TableHead>
                {recordType === 'BOOKS' && <TableHead className="font-semibold">Vendor</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.slice(0, 20).map((record, index) => (
                <TableRow key={index} className="hover:bg-gray-50 transition-colors">
                  <TableCell className="font-mono text-sm">{record.gstin}</TableCell>
                  <TableCell className="font-medium">{record.invoice_number}</TableCell>
                  <TableCell>{record.invoice_date}</TableCell>
                  <TableCell className="text-right font-semibold">₹{(record.invoice_amount || 0).toLocaleString()}</TableCell>
                  <TableCell className="text-right">₹{(record.cgst || 0).toFixed(2)}</TableCell>
                  <TableCell className="text-right">₹{(record.sgst || 0).toFixed(2)}</TableCell>
                  <TableCell className="text-right">₹{(record.igst || 0).toFixed(2)}</TableCell>
                  <TableCell className="text-right font-semibold">₹{(record.total_tax || 0).toFixed(2)}</TableCell>
                  {recordType === 'BOOKS' && <TableCell>{record.vendor_name || '-'}</TableCell>}
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {data.length > 20 && (
            <div className="text-center mt-4 p-4 bg-gray-50 rounded-lg">
              <p className="text-sm text-gray-600">
                Showing first 20 of {data.length.toLocaleString()} records
              </p>
              <p className="text-xs text-gray-500 mt-1">
                Use the export feature to download all records
              </p>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
};

// Enhanced Reconciliation Results Component
const ReconciliationResults = ({ summary, matches, onExport, isExporting }) => {
  const { toast } = useToast();

  const getStatusColor = (status) => {
    switch (status) {
      case 'MATCHED': return 'bg-green-100 text-green-800 border-green-200';
      case 'AMOUNT_MISMATCH': return 'bg-orange-100 text-orange-800 border-orange-200';
      case 'TAX_MISMATCH': return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      case 'UNMATCHED_BOOKS': return 'bg-red-100 text-red-800 border-red-200';
      case 'UNMATCHED_2B': return 'bg-purple-100 text-purple-800 border-purple-200';
      default: return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  const getStatusIcon = (status) => {
    switch (status) {
      case 'MATCHED': return <CheckCircle className="h-4 w-4" />;
      case 'AMOUNT_MISMATCH':
      case 'TAX_MISMATCH': return <AlertTriangle className="h-4 w-4" />;
      default: return <XCircle className="h-4 w-4" />;
    }
  };

  if (!summary) {
    return (
      <Card className="card-hover">
        <CardContent className="p-12 text-center">
          <BarChart3 className="h-16 w-16 text-gray-300 mx-auto mb-4" />
          <p className="text-gray-500 text-lg mb-2">No reconciliation data available</p>
          <p className="text-gray-400 text-sm mb-6">
            Upload both Books and 2B data, then click "Run Reconciliation" to analyze matches and discrepancies
          </p>
          <div className="flex items-center justify-center space-x-2 text-sm text-gray-400">
            <Lightbulb className="h-4 w-4" />
            <span>Tip: Ensure both datasets contain GSTIN and Invoice Number for accurate matching</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Prepare chart data
  const statusData = [
    { name: 'Matched', value: summary.matched_records, color: '#22c55e' },
    { name: 'Amount Mismatch', value: summary.amount_mismatches, color: '#f97316' },
    { name: 'Tax Mismatch', value: summary.tax_mismatches, color: '#eab308' },
    { name: 'Unmatched Books', value: summary.unmatched_books_records, color: '#ef4444' },
    { name: 'Unmatched 2B', value: summary.unmatched_2b_records, color: '#8b5cf6' }
  ];

  const summaryStats = [
    { 
      title: 'Total Books Records', 
      value: summary.total_books_records, 
      icon: FileText,
      color: 'text-blue-600',
      bgColor: 'bg-blue-50'
    },
    { 
      title: 'Total 2B Records', 
      value: summary.total_2b_records, 
      icon: Shield,
      color: 'text-green-600',
      bgColor: 'bg-green-50'
    },
    { 
      title: 'Perfect Matches', 
      value: summary.matched_records, 
      icon: CheckCircle,
      color: 'text-emerald-600',
      bgColor: 'bg-emerald-50'
    },
    { 
      title: 'Total Discrepancies', 
      value: summary.amount_mismatches + summary.tax_mismatches + summary.unmatched_books_records + summary.unmatched_2b_records, 
      icon: AlertTriangle,
      color: 'text-orange-600',
      bgColor: 'bg-orange-50'
    }
  ];

  const matchRate = summary.total_books_records > 0 ? 
    ((summary.matched_records / Math.max(summary.total_books_records, summary.total_2b_records)) * 100) : 0;

  return (
    <div className="space-y-8">
      {/* Header with Key Metrics */}
      <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-xl p-6 border border-blue-100">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h3 className="text-2xl font-bold text-gray-900 mb-2">Reconciliation Summary</h3>
            <p className="text-gray-600">Analysis of GST data matching and discrepancies</p>
          </div>
          <div className="text-right">
            <div className="text-3xl font-bold text-blue-600">{matchRate.toFixed(1)}%</div>
            <div className="text-sm text-gray-600">Match Rate</div>
          </div>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {summaryStats.map((stat, index) => (
            <div key={index} className="bg-white rounded-lg p-4 border border-gray-100 card-hover">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">{stat.title}</p>
                  <p className="text-2xl font-bold mt-1">{(stat.value || 0).toLocaleString()}</p>
                </div>
                <div className={`p-3 rounded-lg ${stat.bgColor}`}>
                  <stat.icon className={`h-6 w-6 ${stat.color}`} />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <Card className="card-hover chart-container">
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <BarChart3 className="h-5 w-5" />
              <span>Status Distribution</span>
            </CardTitle>
            <CardDescription>Breakdown of reconciliation results</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={statusData}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={120}
                  dataKey="value"
                  label={({ name, value, percent }) => `${name}: ${value} (${(percent * 100).toFixed(1)}%)`}
                >
                  {statusData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <ChartTooltip />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="card-hover">
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <TrendingUp className="h-5 w-5" />
              <span>Financial Impact</span>
            </CardTitle>
            <CardDescription>Monetary differences identified</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-6">
              <div>
                <div className="flex justify-between items-center mb-3">
                  <span className="text-sm font-medium text-gray-600">Total Amount Difference</span>
                  <span className="text-xl font-bold text-red-600">
                    ₹{(summary.total_amount_difference || 0).toLocaleString()}
                  </span>
                </div>
                <Progress 
                  value={Math.min(((summary.total_amount_difference || 0) / 1000000) * 100, 100)} 
                  className="h-3 progress-enhanced"
                />
                <p className="text-xs text-gray-500 mt-1">Amount discrepancies across all records</p>
              </div>
              
              <div>
                <div className="flex justify-between items-center mb-3">
                  <span className="text-sm font-medium text-gray-600">Total Tax Difference</span>
                  <span className="text-xl font-bold text-orange-600">
                    ₹{(summary.total_tax_difference || 0).toLocaleString()}
                  </span>
                </div>
                <Progress 
                  value={Math.min(((summary.total_tax_difference || 0) / 100000) * 100, 100)} 
                  className="h-3 progress-enhanced"
                />
                <p className="text-xs text-gray-500 mt-1">Tax calculation differences</p>
              </div>
              
              <div className="bg-gray-50 rounded-lg p-4 mt-4">
                <h4 className="font-semibold text-gray-800 mb-2 flex items-center">
                  <Info className="h-4 w-4 mr-2" />
                  Summary
                </h4>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-gray-600">Records Processed:</span>
                    <div className="font-semibold">{((summary.total_books_records || 0) + (summary.total_2b_records || 0)).toLocaleString()}</div>
                  </div>
                  <div>
                    <span className="text-gray-600">Issues Found:</span>
                    <div className="font-semibold text-orange-600">
                      {((summary.amount_mismatches || 0) + (summary.tax_mismatches || 0) + 
                        (summary.unmatched_books_records || 0) + (summary.unmatched_2b_records || 0)).toLocaleString()}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Export Button */}
      <div className="flex justify-between items-center">
        <div className="flex items-center space-x-2 text-sm text-gray-600">
          <Award className="h-4 w-4" />
          <span>Professional reconciliation report ready for download</span>
        </div>
        <Button 
          onClick={onExport} 
          disabled={isExporting}
          className="bg-gradient-to-r from-green-600 to-green-700 hover:from-green-700 hover:to-green-800 button-hover-scale"
        >
          {isExporting ? (
            <div className="flex items-center space-x-2">
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
              <span>Generating...</span>
            </div>
          ) : (
            <>
              <Download className="h-4 w-4 mr-2" />
              Export Excel Report
            </>
          )}
        </Button>
      </div>

      {/* Detailed Matches Table */}
      {matches && matches.length > 0 && (
        <Card className="card-hover">
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <FileSpreadsheet className="h-5 w-5" />
              <span>Detailed Results</span>
            </CardTitle>
            <CardDescription>
              Showing first 50 reconciliation matches - export for complete data
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="font-semibold">Status</TableHead>
                    <TableHead className="font-semibold">GSTIN</TableHead>
                    <TableHead className="font-semibold">Invoice Number</TableHead>
                    <TableHead className="font-semibold text-right">Amount Diff</TableHead>
                    <TableHead className="font-semibold text-right">Tax Diff</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {matches.slice(0, 50).map((match, index) => (
                    <TableRow key={index} className="hover:bg-gray-50 transition-colors">
                      <TableCell>
                        <Badge className={`${getStatusColor(match.match_status)} border status-badge`}>
                          <div className="flex items-center gap-1">
                            {getStatusIcon(match.match_status)}
                            {match.match_status.replace('_', ' ')}
                          </div>
                        </Badge>
                      </TableCell>
                      <TableCell className="font-mono text-sm">{match.gstin}</TableCell>
                      <TableCell className="font-medium">{match.invoice_number}</TableCell>
                      <TableCell className={`text-right font-medium ${(match.invoice_amount_diff || 0) !== 0 ? 'text-red-600' : 'text-gray-600'}`}>
                        ₹{(match.invoice_amount_diff || 0).toFixed(2)}
                      </TableCell>
                      <TableCell className={`text-right font-medium ${(match.total_tax_diff || 0) !== 0 ? 'text-orange-600' : 'text-gray-600'}`}>
                        ₹{(match.total_tax_diff || 0).toFixed(2)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              {matches.length > 50 && (
                <div className="text-center mt-4 p-4 bg-gray-50 rounded-lg">
                  <p className="text-sm text-gray-600">
                    Showing first 50 of {matches.length.toLocaleString()} matches
                  </p>
                  <p className="text-xs text-gray-500 mt-1">
                    Export the full report to access all reconciliation details
                  </p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

// Instructions Component
const InstructionsCard = ({ title, steps, icon: Icon }) => (
  <Card className="card-hover mb-6">
    <CardHeader>
      <CardTitle className="flex items-center space-x-2">
        <Icon className="h-5 w-5 text-blue-600" />
        <span>{title}</span>
      </CardTitle>
    </CardHeader>
    <CardContent>
      <div className="space-y-3">
        {steps.map((step, index) => (
          <div key={index} className="flex items-start space-x-3">
            <div className="flex-shrink-0 w-6 h-6 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center text-sm font-semibold">
              {index + 1}
            </div>
            <p className="text-sm text-gray-700">{step}</p>
          </div>
        ))}
      </div>
    </CardContent>
  </Card>
);

// Main App Component
function App() {
  const [booksData, setBooksData] = useState([]);
  const [twobData, setTwobData] = useState([]);
  const [reconciliationSummary, setReconciliationSummary] = useState(null);
  const [reconciliationMatches, setReconciliationMatches] = useState([]);
  const [isUploading, setIsUploading] = useState(false);
  const [isReconciling, setIsReconciling] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [activeTab, setActiveTab] = useState('upload');
  const { toast } = useToast();

  // Load initial data
  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [booksResponse, twobResponse] = await Promise.all([
        axios.get(`${API}/records/BOOKS`),
        axios.get(`${API}/records/2B`)
      ]);
      
      setBooksData(booksResponse.data || []);
      setTwobData(twobResponse.data || []);
      
      // Load reconciliation data if available
      try {
        const summaryResponse = await axios.get(`${API}/reconciliation/summary`);
        setReconciliationSummary(summaryResponse.data);
        
        const matchesResponse = await axios.get(`${API}/reconciliation/matches`);
        setReconciliationMatches(matchesResponse.data || []);
      } catch (error) {
        // Reconciliation data may not exist yet
        setReconciliationSummary(null);
        setReconciliationMatches([]);
      }
    } catch (error) {
      console.error('Error loading data:', error);
      toast({
        title: "Error loading data",
        description: "There was an issue loading your data. Please refresh the page.",
        variant: "destructive",
      });
    }
  };

  const handleFileUpload = async (file, recordType) => {
    setIsUploading(true);
    const formData = new FormData();
    formData.append('file', file);

    try {
      const response = await axios.post(`${API}/upload/${recordType}`, formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });

      toast({
        title: "✅ Upload successful",
        description: response.data.message || `Successfully uploaded ${response.data.uploaded_count || 0} ${recordType} records`,
      });

      // Show warnings if any
      if (response.data.warnings) {
        setTimeout(() => {
          toast({
            title: "⚠️ Upload completed with warnings",
            description: `${response.data.warnings.failed_validations} rows had validation issues. Please check your data.`,
            variant: "destructive",
          });
        }, 1000);
      }

      await loadData();
    } catch (error) {
      const errorMessage = error.response?.data?.detail || error.response?.data?.message || "Failed to upload file";
      toast({
        title: "Upload failed",
        description: typeof errorMessage === 'string' ? errorMessage : "Please check your file format and try again",
        variant: "destructive",
      });
    } finally {
      setIsUploading(false);
    }
  };

  const handleManualEntry = async (data, recordType) => {
    try {
      const response = await axios.post(`${API}/records/${recordType}`, {
        ...data,
        record_type: recordType
      });
      
      toast({
        title: "✅ Record added successfully",
        description: `${recordType} record for ${data.gstin} has been added to your data`,
      });

      await loadData();
      return true; // Indicate success to the form
    } catch (error) {
      const errorDetail = error.response?.data?.detail;
      let errorMessage = "Failed to add record";
      
      if (typeof errorDetail === 'string') {
        errorMessage = errorDetail;
      } else if (Array.isArray(errorDetail)) {
        errorMessage = errorDetail[0]?.msg || errorDetail[0] || "Validation error";
      }
      
      toast({
        title: "❌ Failed to add record",
        description: errorMessage,
        variant: "destructive",
      });
      return false; // Indicate failure to the form
    }
  };

  const handleReconciliation = async () => {
    if (booksData.length === 0 || twobData.length === 0) {
      toast({
        title: "Insufficient data",
        description: "Please upload both Books and 2B data before reconciliation",
        variant: "destructive",
      });
      return;
    }

    setIsReconciling(true);
    try {
      const response = await axios.post(`${API}/reconcile`);
      
      toast({
        title: "Reconciliation completed",
        description: `Successfully processed ${response.data.matches_processed} records`,
      });

      await loadData();
      setActiveTab('results');
    } catch (error) {
      const errorMessage = error.response?.data?.detail || "Failed to perform reconciliation";
      toast({
        title: "Reconciliation failed",
        description: errorMessage,
        variant: "destructive",
      });
    } finally {
      setIsReconciling(false);
    }
  };

  const handleExport = async () => {
    if (!reconciliationSummary) {
      toast({
        title: "No data to export",
        description: "Please run reconciliation first",
        variant: "destructive",
      });
      return;
    }

    setIsExporting(true);
    try {
      const response = await axios.get(`${API}/reconciliation/export`, {
        responseType: 'blob'
      });
      
      const blob = new Blob([response.data], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      });
      
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      
      // Get filename from response headers or use default
      const contentDisposition = response.headers['content-disposition'];
      let filename = 'gst_reconciliation_report.xlsx';
      if (contentDisposition) {
        const filenameMatch = contentDisposition.match(/filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/);
        if (filenameMatch && filenameMatch[1]) {
          filename = filenameMatch[1].replace(/['"]/g, '');
        }
      }
      
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(link);
      
      toast({
        title: "Export successful",
        description: "Your reconciliation report has been downloaded",
      });
    } catch (error) {
      toast({
        title: "Export failed",
        description: "Failed to generate export file. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsExporting(false);
    }
  };

  const handleClearData = async (recordType) => {
    try {
      const response = await axios.delete(`${API}/records/${recordType}`);
      
      toast({
        title: "Data cleared successfully",
        description: response.data.message || `${recordType} data has been cleared`,
      });

      await loadData();
    } catch (error) {
      toast({
        title: "Failed to clear data",
        description: error.response?.data?.detail || "Failed to clear data",
        variant: "destructive",
      });
    }
  };

  return (
    <TooltipProvider>
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50">
        <div className="container mx-auto px-4 py-8 max-w-7xl">
          {/* Enhanced Header */}
          <div className="text-center mb-10">
            <div className="flex items-center justify-center mb-4">
              <div className="p-3 bg-blue-600 rounded-xl">
                <Calculator className="h-8 w-8 text-white" />
              </div>
            </div>
            <h1 className="text-4xl font-bold text-gray-900 mb-3">GST Reconciliation System</h1>
            <p className="text-lg text-gray-600 mb-4">
              Professional GSTR-2B vs Books reconciliation with detailed analysis and reporting
            </p>
            <div className="flex items-center justify-center space-x-6 text-sm text-gray-500">
              <div className="flex items-center space-x-1">
                <Shield className="h-4 w-4" />
                <span>Secure Processing</span>
              </div>
              <div className="flex items-center space-x-1">
                <FileSpreadsheet className="h-4 w-4" />
                <span>Excel & CSV Support</span>
              </div>
              <div className="flex items-center space-x-1">
                <TrendingUp className="h-4 w-4" />
                <span>Advanced Analytics</span>
              </div>
            </div>
          </div>

          {/* Enhanced Quick Stats */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-10">
            <Card className="summary-card">
              <CardContent className="p-6 text-center">
                <div className="flex items-center justify-center mb-4">
                  <div className="p-3 bg-blue-100 rounded-full">
                    <FileText className="h-8 w-8 text-blue-600" />
                  </div>
                </div>
                <p className="text-3xl font-bold text-gray-900 mb-1">{booksData.length.toLocaleString()}</p>
                <p className="text-sm text-gray-600 font-medium">Books Records</p>
                <p className="text-xs text-gray-500 mt-1">Accounting system data</p>
              </CardContent>
            </Card>
            
            <Card className="summary-card">
              <CardContent className="p-6 text-center">
                <div className="flex items-center justify-center mb-4">
                  <div className="p-3 bg-green-100 rounded-full">
                    <Shield className="h-8 w-8 text-green-600" />
                  </div>
                </div>
                <p className="text-3xl font-bold text-gray-900 mb-1">{twobData.length.toLocaleString()}</p>
                <p className="text-sm text-gray-600 font-medium">GSTR-2B Records</p>
                <p className="text-xs text-gray-500 mt-1">Government portal data</p>
              </CardContent>
            </Card>
            
            <Card className="summary-card">
              <CardContent className="p-6 text-center">
                <div className="flex items-center justify-center mb-4">
                  <div className="p-3 bg-purple-100 rounded-full">
                    <BarChart3 className="h-8 w-8 text-purple-600" />
                  </div>
                </div>
                <p className="text-3xl font-bold text-gray-900 mb-1">
                  {(reconciliationSummary?.matched_records || 0).toString()}
                </p>
                <p className="text-sm text-gray-600 font-medium">Matched Records</p>
                <p className="text-xs text-gray-500 mt-1">Successfully reconciled</p>
              </CardContent>
            </Card>
          </div>

          {/* Main Tabs */}
          <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-8">
            <TabsList className="grid w-full grid-cols-4 bg-white shadow-sm border border-gray-200">
              <TabsTrigger value="upload" className="data-tab">
                <Upload className="h-4 w-4 mr-2" />
                Data Upload
              </TabsTrigger>
              <TabsTrigger value="manual" className="data-tab">
                <Calculator className="h-4 w-4 mr-2" />
                Manual Entry
              </TabsTrigger>
              <TabsTrigger value="view" className="data-tab">
                <FileText className="h-4 w-4 mr-2" />
                View Data
              </TabsTrigger>
              <TabsTrigger value="results" className="data-tab">
                <BarChart3 className="h-4 w-4 mr-2" />
                Reconciliation
              </TabsTrigger>
            </TabsList>

            {/* Data Upload Tab */}
            <TabsContent value="upload" className="space-y-8 tab-content">
              <InstructionsCard
                title="File Upload Instructions"
                icon={Info}
                steps={[
                  "Prepare your Excel (.xlsx, .xls) or CSV files with columns: GSTIN, Invoice Number, Invoice Date, Invoice Amount, CGST, SGST, IGST",
                  "Column names are flexible - variations like 'GST Number', 'Inv No', 'Bill Amount' are automatically recognized",
                  "Upload Books data (from your accounting system) and GSTR-2B data (from government portal)",
                  "Files are processed automatically with validation and error reporting",
                  "Maximum file size: 10MB per file"
                ]}
              />
              
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                <Card className="card-hover">
                  <CardHeader>
                    <CardTitle className="flex items-center space-x-2">
                      <FileText className="h-5 w-5 text-blue-600" />
                      <span>Upload Books Data</span>
                    </CardTitle>
                    <CardDescription>
                      Upload your accounting system or books data in Excel or CSV format
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <FileUploadZone 
                      onFileUpload={handleFileUpload} 
                      recordType="BOOKS" 
                      isUploading={isUploading}
                    />
                    {booksData.length > 0 && (
                      <div className="mt-6 flex justify-between items-center p-4 bg-green-50 rounded-lg border border-green-200">
                        <div className="flex items-center space-x-2">
                          <CheckCircle className="h-5 w-5 text-green-600" />
                          <Badge variant="secondary" className="bg-green-100 text-green-800">
                            {booksData.length.toLocaleString()} records loaded
                          </Badge>
                        </div>
                        <Button 
                          variant="outline" 
                          size="sm"
                          onClick={() => handleClearData('BOOKS')}
                          className="text-red-600 hover:bg-red-50 border-red-200"
                        >
                          <Trash2 className="h-4 w-4 mr-2" />
                          Clear
                        </Button>
                      </div>
                    )}
                  </CardContent>
                </Card>

                <Card className="card-hover">
                  <CardHeader>
                    <CardTitle className="flex items-center space-x-2">
                      <Shield className="h-5 w-5 text-green-600" />
                      <span>Upload GSTR-2B Data</span>
                    </CardTitle>
                    <CardDescription>
                      Upload your GSTR-2B data downloaded from the government portal
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <FileUploadZone 
                      onFileUpload={handleFileUpload} 
                      recordType="2B" 
                      isUploading={isUploading}
                    />
                    {twobData.length > 0 && (
                      <div className="mt-6 flex justify-between items-center p-4 bg-green-50 rounded-lg border border-green-200">
                        <div className="flex items-center space-x-2">
                          <CheckCircle className="h-5 w-5 text-green-600" />
                          <Badge variant="secondary" className="bg-green-100 text-green-800">
                            {twobData.length.toLocaleString()} records loaded
                          </Badge>
                        </div>
                        <Button 
                          variant="outline" 
                          size="sm"
                          onClick={() => handleClearData('2B')}
                          className="text-red-600 hover:bg-red-50 border-red-200"
                        >
                          <Trash2 className="h-4 w-4 mr-2" />
                          Clear
                        </Button>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>

              <Alert className="border-blue-200 bg-blue-50">
                <Lightbulb className="h-4 w-4 text-blue-600" />
                <AlertDescription className="text-blue-800">
                  <strong>Pro Tip:</strong> Your Excel/CSV files should contain columns for GSTIN, Invoice Number, Invoice Date, Invoice Amount, CGST, SGST, and IGST. 
                  Column names are case-insensitive and variations are automatically detected. For best results, ensure data is clean and properly formatted.
                </AlertDescription>
              </Alert>
            </TabsContent>

            {/* Manual Entry Tab */}
            <TabsContent value="manual" className="space-y-8 tab-content">
              <InstructionsCard
                title="Manual Entry Guidelines"
                icon={Calculator}
                steps={[
                  "Enter individual records manually using the forms below",
                  "GSTIN must be exactly 15 characters (format: 22AAAAA0000A1Z5)",
                  "All amount fields accept decimal values (use 0 if not applicable)",
                  "Invoice date should be in YYYY-MM-DD format",
                  "Vendor name is optional for Books records"
                ]}
              />
              
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                <Card className="card-hover">
                  <CardHeader>
                    <CardTitle className="flex items-center space-x-2">
                      <FileText className="h-5 w-5 text-blue-600" />
                      <span>Add Books Record</span>
                    </CardTitle>
                    <CardDescription>Manually enter accounting/books data</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <ManualEntryForm 
                      recordType="BOOKS" 
                      onSubmit={(data) => handleManualEntry(data, 'BOOKS')} 
                    />
                  </CardContent>
                </Card>

                <Card className="card-hover">
                  <CardHeader>
                    <CardTitle className="flex items-center space-x-2">
                      <Shield className="h-5 w-5 text-green-600" />
                      <span>Add GSTR-2B Record</span>
                    </CardTitle>
                    <CardDescription>Manually enter GSTR-2B portal data</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <ManualEntryForm 
                      recordType="2B" 
                      onSubmit={(data) => handleManualEntry(data, '2B')} 
                    />
                  </CardContent>
                </Card>
              </div>
            </TabsContent>

            {/* View Data Tab */}
            <TabsContent value="view" className="space-y-8 tab-content">
              <div className="flex justify-between items-center">
                <div>
                  <h2 className="text-2xl font-bold text-gray-900">Data Overview</h2>
                  <p className="text-gray-600">Review your uploaded and manually entered records</p>
                </div>
                <Button 
                  variant="outline"
                  onClick={() => handleClearData('ALL')}
                  className="text-red-600 hover:bg-red-50 border-red-200"
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  Clear All Data
                </Button>
              </div>
              
              <div className="space-y-8">
                <DataTable data={booksData} title="Books Data" recordType="BOOKS" />
                <DataTable data={twobData} title="GSTR-2B Data" recordType="2B" />
              </div>
            </TabsContent>

            {/* Reconciliation Results Tab */}
            <TabsContent value="results" className="space-y-8 tab-content">
              <div className="flex justify-between items-center">
                <div>
                  <h2 className="text-2xl font-bold text-gray-900">Reconciliation Analysis</h2>
                  <p className="text-gray-600">Comprehensive matching and variance analysis</p>
                </div>
                <Button 
                  onClick={handleReconciliation}
                  disabled={isReconciling || booksData.length === 0 || twobData.length === 0}
                  className="bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 button-hover-scale"
                >
                  {isReconciling ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                      Processing...
                    </>
                  ) : (
                    <>
                      <RefreshCw className="h-4 w-4 mr-2" />
                      Run Reconciliation
                    </>
                  )}
                </Button>
              </div>
              
              <ReconciliationResults 
                summary={reconciliationSummary} 
                matches={reconciliationMatches}
                onExport={handleExport}
                isExporting={isExporting}
              />
            </TabsContent>
          </Tabs>

          {/* Enhanced Footer */}
          <footer className="mt-16 pt-8 border-t border-gray-200 bg-white rounded-xl">
            <div className="px-6 py-8">
              <div className="flex flex-col md:flex-row justify-between items-center space-y-4 md:space-y-0">
                <div className="flex items-center space-x-3">
                  <div className="p-2 bg-blue-100 rounded-lg">
                    <Calculator className="h-6 w-6 text-blue-600" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-gray-900">GST Reconciliation System</h3>
                    <p className="text-sm text-gray-600">Professional tax compliance made simple</p>
                  </div>
                </div>
                
                <div className="flex items-center space-x-6 text-sm text-gray-500">
                  <div className="flex items-center space-x-1">
                    <Star className="h-4 w-4 text-yellow-500" />
                    <span>Enterprise Grade</span>
                  </div>
                  <div className="flex items-center space-x-1">
                    <Shield className="h-4 w-4 text-green-500" />
                    <span>Secure & Reliable</span>
                  </div>
                  <div className="text-gray-400">
                    © 2024 Built with Emergent AI
                  </div>
                </div>
              </div>
              
              <div className="mt-6 pt-6 border-t border-gray-100">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs text-gray-500">
                  <div>
                    <h4 className="font-semibold text-gray-700 mb-2">Features</h4>
                    <ul className="space-y-1">
                      <li>• Excel & CSV file processing</li>
                      <li>• Intelligent column mapping</li>
                      <li>• Advanced reconciliation algorithms</li>
                      <li>• Professional reporting</li>
                    </ul>
                  </div>
                  <div>
                    <h4 className="font-semibold text-gray-700 mb-2">Data Security</h4>
                    <ul className="space-y-1">
                      <li>• Local data processing</li>
                      <li>• No permanent storage</li>
                      <li>• Secure file handling</li>
                      <li>• Privacy compliant</li>
                    </ul>
                  </div>
                  <div>
                    <h4 className="font-semibold text-gray-700 mb-2">Support</h4>
                    <ul className="space-y-1">
                      <li>• Built-in validation</li>
                      <li>• Error reporting</li>
                      <li>• Export capabilities</li>
                      <li>• Professional results</li>
                    </ul>
                  </div>
                </div>
              </div>
            </div>
          </footer>
        </div>
        <Toaster />
      </div>
    </TooltipProvider>
  );
}

export default App;